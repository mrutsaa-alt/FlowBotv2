const router = require('express').Router();
const pool = require('../config/db');
const bot = require('../services/telegramBot');
const { decryptToken } = require('../services/tokenCrypto');
const { requireAuth } = require('../middleware/auth');
const workspaceAccess = require('../middleware/workspaceAccess');

const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
router.use(requireAuth, workspaceAccess);
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- লগইন ----------
router.get('/config', (_req, res) => res.json({ botUsername: bot.state.username }));
router.post('/login', (req, res) => {
  if (!bot.verifyLogin(req.body)) return res.status(401).json({ error: 'টেলিগ্রাম লগইন যাচাই হয়নি' });
  const u = req.body;
  res.json({ user: { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' '), username: u.username || '', photo_url: u.photo_url || '' } });
});

// ---------- বট কানেক্ট ----------
router.get('/bots', h(async (req, res) =>
  res.json(await q("SELECT id, page_name, platform_page_id FROM channels WHERE platform='telegram' AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$1) ORDER BY id", [req.user.id]))));

router.post('/bots', h(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) return res.status(400).json({ error: 'টোকেনের ফরম্যাট ঠিক নেই (BotFather থেকে পুরোটা কপি করুন)' });
  try { res.status(201).json(await bot.connectBot(token, req.user.id)); }
  catch (e) { res.status(400).json({ error: 'টোকেন গ্রহণযোগ্য নয়: ' + e.message }); }
}));

router.delete('/bots/:id', h(async (req, res) => { const own=await q("SELECT id FROM channels WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$2) AND platform='telegram'",[req.params.id,req.user.id]); if(!own[0])return res.status(404).json({error:'Bot not found'}); await bot.removeBot(req.params.id); res.json({ success: true }); }));

// ---------- অটোমেশন ----------
router.patch('/flows/:id', h(async (req, res) => {
  const current=(await q(
    'SELECT f.*,c.workspace_id FROM flows f JOIN channels c ON c.id=f.channel_id WHERE f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)',
    [req.params.id,req.user.id]))[0];
  if(!current)return res.status(404).json({error:'Flow not found'});
  const active=!current.is_active;
  const graph=current.flow_data||{};
  const trigger=Array.isArray(graph.nodes)?graph.nodes.find(n=>n.data?.kind==='trigger'):null;
  const keyword=String(trigger?.data?.keyword||current.trigger_keyword||'').trim();
  if(active&&current.trigger_type==='keyword'&&!keyword)return res.status(400).json({error:'Add a trigger keyword before publishing this flow.'});
  const updated=(await q(
    `UPDATE flows SET is_active=$1,trigger_keyword=$2,updated_at=NOW(),version=version+1,
      published_at=CASE WHEN $1 THEN NOW() ELSE NULL END
     WHERE id=$3 RETURNING *`,[active,keyword||null,current.id]))[0];
  if(active)await q(
    `INSERT INTO flow_versions(flow_id,version,flow_data,trigger_keyword,created_by)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(flow_id,version) DO NOTHING`,
    [updated.id,updated.version,JSON.stringify(updated.flow_data),updated.trigger_keyword,req.user.id]);
  res.json(updated);
}));
router.delete('/flows/:id', h(async (req, res) => { await q('DELETE FROM flows f USING channels c WHERE f.channel_id=c.id AND f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.id,req.user.id]); res.json({ success: true }); }));

router.get('/:cid/flows', h(async (req, res) =>
  res.json(await q('SELECT f.* FROM flows f JOIN channels c ON c.id=f.channel_id WHERE f.channel_id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2) ORDER BY f.id DESC', [req.params.cid,req.user.id]))));

router.post('/:cid/flows', h(async (req, res) => {
  const b = req.body || {};
  const own = await q('SELECT id FROM channels WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$2)', [req.params.cid,req.user.id]); if(!own[0]) return res.status(404).json({error:'Channel not found'});
  const type = ['keyword', 'welcome', 'default'].includes(b.trigger_type) ? b.trigger_type : 'keyword';
  if (!b.reply?.trim()) return res.status(400).json({ error: 'রিপ্লাই মেসেজ লিখুন' });
  if (type === 'keyword' && !b.trigger_keyword?.trim()) return res.status(400).json({ error: 'কীওয়ার্ড লিখুন' });
  const buttons = (Array.isArray(b.buttons) ? b.buttons : [])
    .filter((x) => x && x.text?.trim() && (x.url?.trim() || x.keyword?.trim()))
    .slice(0, 6)
    .map((x) => ({ text: x.text.trim(), ...(x.url?.trim() ? { url: x.url.trim() } : { keyword: x.keyword.trim() }) }));
  const data = { replyText: b.reply.trim(), imageUrl: b.image_url?.trim() || null, buttons, addTag: b.add_tag?.trim() || null };
  const rows = await q(
    'INSERT INTO flows (channel_id, name, flow_data, trigger_type, trigger_keyword) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.cid, (b.name || b.trigger_keyword || type).trim(), JSON.stringify(data), type, type === 'keyword' ? b.trigger_keyword.trim() : null]
  );
  res.status(201).json(rows[0]);
}));

// ---------- লাইভ চ্যাট ----------
router.get('/chats/:sid/messages', h(async (req, res) =>
  res.json(await q('SELECT id, sender_type, message_text, created_at FROM messages WHERE subscriber_id=$1 AND channel_id IN (SELECT c.id FROM channels c JOIN workspace_members wm ON wm.workspace_id=c.workspace_id WHERE wm.user_id=$2) ORDER BY created_at ASC, id ASC LIMIT 500', [req.params.sid,req.user.id]))));

router.post('/chats/:sid/send', h(async (req, res) => {
  const text = req.body?.text?.trim();
  if (!text) return res.status(400).json({ error: 'মেসেজ লিখুন' });
  const s = (await q('SELECT s.id, s.psid, s.channel_id, c.access_token FROM subscribers s JOIN channels c ON c.id=s.channel_id WHERE s.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.sid,req.user.id]))[0];
  if (!s) return res.status(404).json({ error: 'কন্টাক্ট পাওয়া যায়নি' });
  try { await bot.tg(decryptToken(s.access_token), 'sendMessage', { chat_id: s.psid, text }); }
  catch (e) { return res.status(502).json({ error: 'টেলিগ্রাম পাঠাতে পারেনি: ' + e.message }); }
  await q("INSERT INTO messages (channel_id, subscriber_id, sender_type, message_text, message_type) VALUES ($1,$2,'admin',$3,'text')", [s.channel_id, s.id, text]);
  await q('UPDATE subscribers SET bot_paused=TRUE WHERE id=$1', [s.id]);
  res.json({ success: true });
}));

router.patch('/chats/:sid/pause', h(async (req, res) => {
  await q('UPDATE subscribers s SET bot_paused=$1 FROM channels c WHERE s.channel_id=c.id AND s.id=$2 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3)', [!!req.body?.paused, req.params.sid,req.user.id]);
  res.json({ success: true });
}));

router.get('/:cid/chats', h(async (req, res) =>
  res.json(await q(
    `SELECT s.id, s.psid, s.first_name, s.bot_paused, lm.message_text AS last_message, lm.created_at AS last_at
     FROM subscribers s
     LEFT JOIN LATERAL (SELECT message_text, created_at FROM messages m WHERE m.subscriber_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON TRUE
     WHERE s.channel_id=$1 AND EXISTS(SELECT 1 FROM channels c WHERE c.id=s.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)) ORDER BY COALESCE(lm.created_at, s.created_at) DESC LIMIT 200`, [req.params.cid,req.user.id]))));

// ---------- কন্টাক্ট ও ট্যাগ ----------
router.get('/:cid/contacts', h(async (req, res) =>
  res.json(await q(
    `SELECT s.id, s.first_name, s.last_name, s.psid, s.status, s.created_at, s.marketing_opt_in,
            COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
     FROM subscribers s
     LEFT JOIN subscriber_tags st ON st.subscriber_id = s.id
     LEFT JOIN tags t ON t.id = st.tag_id
     WHERE s.channel_id=$1 AND EXISTS(SELECT 1 FROM channels c WHERE c.id=s.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)) GROUP BY s.id ORDER BY s.id DESC LIMIT 500`, [req.params.cid,req.user.id]))));

router.get('/:cid/tags', h(async (req, res) =>
  res.json(await q('SELECT id, name FROM tags WHERE channel_id=$1 AND EXISTS(SELECT 1 FROM channels c WHERE c.id=tags.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)) ORDER BY name', [req.params.cid,req.user.id]))));

router.post('/:cid/tags', h(async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'ট্যাগের নাম দিন' });
  const ex = await q('SELECT id, name FROM tags WHERE channel_id=$1 AND name=$2 AND EXISTS(SELECT 1 FROM channels c WHERE c.id=tags.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3))', [req.params.cid, name,req.user.id]);
  if (ex[0]) return res.json(ex[0]);
  res.status(201).json((await q('INSERT INTO tags (channel_id, name) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM channels WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$3)) RETURNING id, name', [req.params.cid, name,req.user.id]))[0]);
}));

router.delete('/tags/:id', h(async (req, res) => { await q('DELETE FROM tags t USING channels c WHERE t.id=$1 AND c.id=t.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.id,req.user.id]); res.json({ success: true }); }));

router.post('/contacts/:sid/tags', h(async (req, res) => {
  await q('INSERT INTO subscriber_tags (subscriber_id, tag_id) SELECT s.id,t.id FROM subscribers s JOIN channels c ON c.id=s.channel_id JOIN tags t ON t.id=$2 AND t.channel_id=c.id WHERE s.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3) ON CONFLICT DO NOTHING', [req.params.sid, req.body?.tag_id,req.user.id]);
  res.json({ success: true });
}));
router.delete('/contacts/:sid/tags/:tid', h(async (req, res) => {
  await q('DELETE FROM subscriber_tags st USING subscribers s, channels c WHERE st.subscriber_id=s.id AND st.tag_id=$3 AND s.id=$1 AND s.channel_id=c.id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.sid,req.user.id,req.params.tid]);
  res.json({ success: true });
}));

// ---------- ব্রডকাস্ট ----------
router.get('/:cid/broadcasts', h(async (req, res) =>
  res.json(await q('SELECT * FROM broadcasts WHERE channel_id=$1 AND EXISTS(SELECT 1 FROM channels c WHERE c.id=broadcasts.channel_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)) ORDER BY id DESC LIMIT 50', [req.params.cid,req.user.id]))));

router.patch('/:cid/broadcasts/:id', h(async (req,res) => {
  const name=String(req.body?.name||'Broadcast').trim().slice(0,255),message=String(req.body?.message||'').trim(),tagId=req.body?.tag_id?Number(req.body.tag_id):null;
  if(!message)return res.status(400).json({error:'মেসেজ লিখুন'});
  if(tagId&&!((await q('SELECT id FROM tags WHERE id=$1 AND channel_id=$2',[tagId,req.params.cid]))[0]))return res.status(400).json({error:'Tag does not belong to this channel'});
  const updated=await q(`UPDATE broadcasts b SET name=$1,message_text=$2,tag_id=$3 FROM channels c
    WHERE b.id=$4 AND b.channel_id=$5 AND c.id=b.channel_id AND c.platform='telegram' AND b.status='draft'
      AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$6 AND wm.role IN ('owner','admin','agent')) RETURNING b.*`,[name,message,tagId,req.params.id,req.params.cid,req.user.id]);
  if(!updated[0])return res.status(409).json({error:'Only draft campaigns can be edited.'});
  res.json(updated[0]);
}));
router.post('/:cid/broadcasts/:id/send', h(async(req,res)=>{
  const ch=(await q("SELECT id,access_token FROM channels WHERE id=$1 AND platform='telegram' AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))",[req.params.cid,req.user.id]))[0];
  if(!ch)return res.status(404).json({error:'বট পাওয়া যায়নি'});
  const campaign=(await q("UPDATE broadcasts SET status='queued' WHERE id=$1 AND channel_id=$2 AND status='draft' RETURNING *",[req.params.id,req.params.cid]))[0];
  if(!campaign)return res.status(409).json({error:'Only draft campaigns can be sent.'});
  res.json(campaign);
  bot.broadcast(ch,campaign.id,campaign.message_text,campaign.tag_id).catch(e=>console.error('Broadcast error:',e.message));
}));

router.delete('/:cid/broadcasts/:id', h(async (req, res) => {
  const params=[req.params.id,req.params.cid,req.user.id];
  const scope=`b.id=$1 AND b.channel_id=$2 AND c.id=b.channel_id AND c.platform='telegram'
    AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3 AND wm.role IN ('owner','admin','agent'))`;
  const deleted=await q(`DELETE FROM broadcasts b USING channels c WHERE ${scope} AND b.status<>'sending' RETURNING b.id`,params);
  if(deleted[0])return res.json({success:true});
  const cancelled=await q(`UPDATE broadcasts b SET status='cancel_requested' FROM channels c WHERE ${scope} AND b.status='sending' RETURNING b.id`,params);
  if(!cancelled[0])return res.status(409).json({error:'Campaign not found or unavailable.'});
  res.json({success:true,cancelRequested:true});
}));

router.get('/:cid/broadcasts/:id/recipients', h(async (req,res) => {
  const broadcast = (await q(
    `SELECT b.id FROM broadcasts b JOIN channels c ON c.id=b.channel_id
     WHERE b.id=$1 AND b.channel_id=$2 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3)`,
    [req.params.id,req.params.cid,req.user.id]))[0];
  if(!broadcast)return res.status(404).json({error:'Broadcast not found'});
  res.json(await q(
    `SELECT br.id,br.subscriber_id,br.status,br.attempts,br.last_error,br.sent_at,s.first_name,s.psid
     FROM broadcast_recipients br JOIN subscribers s ON s.id=br.subscriber_id
     WHERE br.broadcast_id=$1 ORDER BY br.id LIMIT 1000`,[broadcast.id]));
}));
router.post('/:cid/broadcasts', h(async (req, res) => {
  const { name, message, tag_id } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'মেসেজ লিখুন' });
  const ch = (await q("SELECT id, access_token FROM channels WHERE id=$1 AND platform='telegram' AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=channels.workspace_id AND wm.user_id=$2)", [req.params.cid,req.user.id]))[0];
  if (!ch) return res.status(404).json({ error: 'বট পাওয়া যায়নি' });
  const draft=Boolean(req.body?.save_as_draft);
  const b = (await q("INSERT INTO broadcasts (channel_id, name, message_text, tag_id, status) VALUES ($1,$2,$3,$4,$5) RETURNING *", [ch.id, name || 'Broadcast', message.trim(), tag_id || null,draft?'draft':'queued']))[0];
  if(draft)return res.status(201).json(b);
  res.status(202).json(b);
  bot.broadcast(ch, b.id, b.message_text, tag_id || null).catch((e) => console.error('Broadcast error:', e.message));
}));

// ---------- পরিসংখ্যান ----------
router.get('/:cid/stats', h(async (req, res) => {
  const id = req.params.cid;
  const one = async (sql) => (await q(sql, [id]))[0].n;
  res.json({
    subscribers: await one('SELECT COUNT(*)::int AS n FROM subscribers WHERE channel_id=$1'),
    messages: await one('SELECT COUNT(*)::int AS n FROM messages WHERE channel_id=$1'),
    flows: await one('SELECT COUNT(*)::int AS n FROM flows WHERE channel_id=$1 AND is_active'),
  });
}));

module.exports = router;
