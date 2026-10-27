require('dotenv').config();
const crypto = require('crypto');
const pool = require('../config/db');
const { encryptToken, decryptToken } = require('./tokenCrypto');
const executionEngine = require('./executionEngine');

const LOGIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const state = { username: null };
const running = new Map(); // channelId -> { stop }
let loginRetryTimer;
let loginRetryDelay = 30000;
const FALLBACK = 'ধন্যবাদ! আপনার মেসেজটি আমরা পেয়েছি। আমাদের প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবে।';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Telegram API error');
  return d.result;
}


const logMsg = (channelId, subId, type, text, kind = 'text') =>
  pool.query(
    'INSERT INTO messages (channel_id, subscriber_id, sender_type, message_text, message_type) VALUES ($1,$2,$3,$4,$5)',
    [channelId, subId, type, text, kind]
  );

async function applyTag(channelId, subId, name) {
  if (!name) return;
  let tag = (await pool.query('SELECT id FROM tags WHERE channel_id=$1 AND name=$2', [channelId, name])).rows[0];
  if (!tag) tag = (await pool.query('INSERT INTO tags (channel_id, name) VALUES ($1,$2) RETURNING id', [channelId, name])).rows[0];
  await pool.query('INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [subId, tag.id]);
}

function keyboard(flow) {
  const btns = (flow?.flow_data?.buttons || []).filter((b) => b.text && (b.url || b.keyword));
  if (!btns.length) return undefined;
  return {
    inline_keyboard: btns.map((b, i) => [
      b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: `cb:${flow.id}:${i}` },
    ]),
  };
}

async function sendFlow(token, chatId, text, flow) {
  const markup = keyboard(flow);
  const img = flow?.flow_data?.imageUrl;
  if (img) return tg(token, 'sendPhoto', { chat_id: chatId, photo: img, caption: text, reply_markup: markup });
  return tg(token, 'sendMessage', { chat_id: chatId, text, reply_markup: markup });
}

async function pickFlow(channelId, text, isStart) {
  const flows = (await pool.query('SELECT * FROM flows WHERE channel_id=$1 AND is_active=TRUE ORDER BY id', [channelId])).rows;
  const low = text.trim().toLowerCase();
  const kw = flows.filter((f) => f.trigger_type === 'keyword' && f.trigger_keyword);
  const keys = (f) => f.trigger_keyword.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (
    (isStart && flows.find((f) => f.trigger_type === 'welcome')) ||
    kw.find((f) => keys(f).includes(low)) ||
    kw.find((f) => keys(f).some((k) => low.includes(k))) ||
    flows.find((f) => f.trigger_type === 'default') ||
    null
  );
}

async function handleText(ch, from, chatId, text) {
  const psid = String(chatId);
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'User';
  let sub = (await pool.query('SELECT id, bot_paused FROM subscribers WHERE channel_id=$1 AND psid=$2', [ch.id, psid])).rows[0];
  if (!sub) {
    sub = (await pool.query(
      'INSERT INTO subscribers (channel_id, psid, first_name, status) VALUES ($1,$2,$3,$4) RETURNING id, bot_paused',
      [ch.id, psid, name, 'active']
    )).rows[0];
  }
  await logMsg(ch.id, sub.id, 'subscriber', text);
  await pool.query('UPDATE subscribers SET last_interaction_at = NOW() WHERE id=$1', [sub.id]);

  const start = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
  if (start && start[1]) await applyTag(ch.id, sub.id, `source:${start[1].slice(0, 40)}`);
  if (sub.bot_paused) return; // এজেন্ট লাইভ চ্যাট করছে

  const graphFlows = (await pool.query(`SELECT * FROM flows WHERE channel_id=$1 AND is_active=TRUE ORDER BY CASE trigger_type WHEN 'keyword' THEN 0 WHEN 'welcome' THEN 1 ELSE 2 END,id DESC`,[ch.id])).rows
    .filter(f => Array.isArray(f.flow_data?.nodes) && f.flow_data.nodes.length > 0);
  for (const graphFlow of graphFlows) {
    if (await executionEngine.startExecution({channelId:ch.id,subscriberId:sub.id,senderPsid:psid,incomingText:text,flow:graphFlow})) return;
  }

  const flow = await pickFlow(ch.id, text, !!start);
  const reply = flow?.flow_data?.replyText || FALLBACK;
  await sendFlow(ch.access_token, chatId, reply, flow);
  await logMsg(ch.id, sub.id, 'bot', reply);
  if (flow?.flow_data?.addTag) await applyTag(ch.id, sub.id, flow.flow_data.addTag);
}

async function handleCallback(ch, cq) {
  tg(ch.access_token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
  const m = /^cb:(\d+):(\d+)$/.exec(cq.data || '');
  if (!m || !cq.message) return;
  const f = (await pool.query('SELECT flow_data FROM flows WHERE id=$1 AND channel_id=$2', [m[1], ch.id])).rows[0];
  const kw = f?.flow_data?.buttons?.[Number(m[2])]?.keyword;
  if (kw) await handleText(ch, cq.from, cq.message.chat.id, kw);
}

async function poll(ch, ctl) {
  let offset = 0;
  while (!ctl.stop) {
    try {
      const updates = await tg(ch.access_token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message?.text && u.message.chat.type === 'private') await handleText(ch, u.message.from, u.message.chat.id, u.message.text);
          else if (u.callback_query) await handleCallback(ch, u.callback_query);
        } catch (e) { console.error('Telegram handle error:', e.message); }
      }
    } catch (e) {
      if (ctl.stop) break;
      console.error('Telegram polling error:', e.message);
      await sleep(5000);
    }
  }
}

async function startBot(ch) {
  if (running.has(ch.id)) return;
  const ctl = { stop: false };
  running.set(ch.id, ctl);
  try { await tg(ch.access_token, 'deleteWebhook'); } catch (e) { console.error('deleteWebhook:', e.message); }
  poll(ch, ctl);
}

async function connectBot(token, userId) {
  const me = await tg(token, 'getMe');
  const pid = String(me.id), pname = `Telegram @${me.username}`;
  const ex = await pool.query('SELECT id,user_id FROM channels WHERE platform_page_id=$1', [pid]);
  if (ex.rows[0] && Number(ex.rows[0].user_id) !== Number(userId)) throw new Error('This Telegram bot is already connected to another account');
  const ws = (await pool.query('SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1',[userId])).rows[0]; if(!ws) throw new Error('Workspace not found. Re-login after database migration.');
  let id;
  if (ex.rows[0]) {
    id = ex.rows[0].id;
    await pool.query('UPDATE channels SET access_token=$1, page_name=$2, user_id=$3, workspace_id=$4 WHERE id=$5', [encryptToken(token), pname, userId, ws.id, id]);
    const old = running.get(id); if (old) { old.stop = true; running.delete(id); }
  } else {
    id = (await pool.query(
      "INSERT INTO channels (platform, platform_page_id, page_name, access_token, user_id, workspace_id) VALUES ('telegram',$1,$2,$3,$4,$5) RETURNING id",
      [pid, pname, encryptToken(token), userId, ws.id]
    )).rows[0].id;
  }
  await startBot({ id, access_token: token });
  console.log(`🤖 Telegram বট চালু: @${me.username}`);
  return { id, username: me.username, name: me.first_name };
}

async function removeBot(id) {
  const c = running.get(Number(id)); if (c) { c.stop = true; running.delete(Number(id)); }
  await pool.query("DELETE FROM channels WHERE id=$1 AND platform='telegram'", [id]);
}


async function broadcast(ch, broadcastId, text, tagId) {
  ch = { ...ch, access_token: decryptToken(ch.access_token) };
  const params = [ch.id];
  let selectSql = `SELECT s.id AS subscriber_id FROM subscribers s WHERE s.channel_id=$1 AND COALESCE(s.status,'active') <> 'blocked'`;
  if (tagId) {
    params.push(tagId);
    selectSql += ' AND EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id=st.tag_id WHERE st.subscriber_id=s.id AND t.channel_id=$1 AND t.id=$2)';
  }
  const subs = (await pool.query(selectSql, params)).rows;
  for (const sub of subs) {
    await pool.query(
      'INSERT INTO broadcast_recipients(broadcast_id,subscriber_id) VALUES($1,$2) ON CONFLICT(broadcast_id,subscriber_id) DO NOTHING',
      [broadcastId,sub.subscriber_id]);
  }
  const claimed=await pool.query("UPDATE broadcasts SET status='sending',queued_at=COALESCE(queued_at,NOW()) WHERE id=$1 AND status='queued' RETURNING id",[broadcastId]);
  if(!claimed.rowCount){await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[broadcastId]);return;}
  let sent = 0, failed = 0;
  for (const sub of subs) {
    const status=(await pool.query('SELECT status FROM broadcasts WHERE id=$1',[broadcastId])).rows[0]?.status;
    if(status==='cancel_requested'){
      await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[broadcastId]);
      return;
    }
    if(status!=='sending')return;
    const rec = (await pool.query('SELECT id,attempts,status FROM broadcast_recipients WHERE broadcast_id=$1 AND subscriber_id=$2',
      [broadcastId,sub.subscriber_id])).rows[0];
    if (!rec || rec.status === 'sent') { if(rec?.status==='sent')sent++; continue; }
    let delivered = false, lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await pool.query("UPDATE broadcast_recipients SET status='sending',attempts=attempts+1 WHERE id=$1",[rec.id]);
      try {
        const psid = (await pool.query('SELECT psid FROM subscribers WHERE id=$1 AND channel_id=$2',[sub.subscriber_id,ch.id])).rows[0]?.psid;
        if (!psid) throw new Error('Subscriber not found');
        await tg(ch.access_token,'sendMessage',{chat_id:psid,text});
        await logMsg(ch.id,sub.subscriber_id,'bot',text,'broadcast');
        await pool.query("UPDATE broadcast_recipients SET status='sent',sent_at=NOW(),last_error=NULL WHERE id=$1",[rec.id]);
        delivered = true; sent++; break;
      } catch (e) {
        lastError = String(e.message || 'Delivery failed').slice(0,1000);
        if (attempt < 2) await sleep(500 * (attempt + 1));
      }
    }
    if (!delivered) {
      failed++;
      await pool.query("UPDATE broadcast_recipients SET status='failed',last_error=$2 WHERE id=$1",[rec.id,lastError]);
    }
    await sleep(60);
  }
  const finished=await pool.query("UPDATE broadcasts SET status='done',sent_count=$1,failed_count=$2,completed_at=NOW(),last_error=NULL WHERE id=$3 AND status='sending' RETURNING id",
    [sent,failed,broadcastId]);
  if(!finished.rowCount)await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[broadcastId]);
}
async function resumeBroadcasts() {
  // Re-queue jobs left mid-flight by a restart; recipient rows prevent duplicate successful sends.
  await pool.query("DELETE FROM broadcasts WHERE status='cancel_requested'");
  await pool.query("UPDATE broadcast_recipients SET status='queued' WHERE status='sending'");
  const jobs = (await pool.query(
    `SELECT b.id AS broadcast_id,b.channel_id,b.message_text,b.tag_id,c.access_token
     FROM broadcasts b JOIN channels c ON c.id=b.channel_id
     WHERE b.status IN ('queued','sending') AND c.platform='telegram'
     ORDER BY b.id LIMIT 50`
  )).rows;
  for (const job of jobs) {
    broadcast({id:job.channel_id,access_token:job.access_token},job.broadcast_id,job.message_text,job.tag_id)
      .catch(e=>console.error('Broadcast resume failed:',e.message));
  }
}

function scheduleLoginRetry() {
  if (loginRetryTimer) return;
  loginRetryTimer = setTimeout(async () => {
    loginRetryTimer = null;
    try {
      state.username = (await tg(LOGIN_TOKEN, 'getMe')).username;
      loginRetryDelay = 30000;
      console.log('Telegram login bot connected');
    } catch (e) {
      console.error('Telegram login bot retry failed:', e.message);
      loginRetryDelay = Math.min(loginRetryDelay * 2, 300000);
      scheduleLoginRetry();
    }
  }, loginRetryDelay);
  loginRetryTimer.unref();
}

async function startAll() {
  try {
    if (LOGIN_TOKEN) {
      try { state.username = (await tg(LOGIN_TOKEN, 'getMe')).username; }
      catch (e) {
        console.error('লগইন বট শুরু হয়নি:', e.message);
        scheduleLoginRetry();
      }
    }
    const rows = (await pool.query("SELECT id, access_token FROM channels WHERE platform='telegram'")).rows;
    for (const ch of rows) {
      try {
        await startBot({ ...ch, access_token: decryptToken(ch.access_token) });
      } catch (e) {
        console.error(`Telegram bot startup failed for channel ${ch.id}:`, e.message);
      }
    }
    await resumeBroadcasts();
  } catch (e) { console.error('Telegram শুরু করা যায়নি:', e.message); }
}

// টেলিগ্রাম লগইন উইজেটের ডেটা যাচাই
function verifyLogin(data) {
  if (!LOGIN_TOKEN || !data || !data.hash) return false;
  const { hash, ...rest } = data;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(LOGIN_TOKEN).digest();
  const h = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const age = Date.now() / 1000 - Number(rest.auth_date);
  if (!Number.isFinite(age) || age < -60 || age >= 86400) return false;
  const a = Buffer.from(h, 'hex'), b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { startAll, connectBot, removeBot, broadcast, resumeBroadcasts, tg, state, verifyLogin };
