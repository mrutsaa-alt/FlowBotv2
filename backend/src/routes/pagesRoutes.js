require('dotenv').config();
const router = require('express').Router();
const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const pool = require('../config/db');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { encryptToken } = require('../services/tokenCrypto');
const workspaceAccess = require('../middleware/workspaceAccess');

const META_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;
const REDIRECT = `${process.env.BACKEND_URL}/api/auth/facebook/callback`;
const FRONT = (process.env.FRONTEND_URL || '').split(',')[0];

const gj = async (url, opts) => {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
  return d;
};

router.get('/auth/facebook/callback', async (req, res) => {
  const { code, error_description, state } = req.query;
  const stateValue = String(state || '');
  if (!/^[a-f0-9]{64}$/.test(stateValue)) return res.redirect(`${FRONT || ''}/?connect_error=invalid_oauth_state`);
  let oauth;
  try {
    oauth = (await pool.query(
      `UPDATE oauth_states SET consumed_at=NOW()
       WHERE state_hash=$1 AND provider='facebook' AND consumed_at IS NULL AND expires_at>NOW()
       RETURNING user_id`,
      [crypto.createHash('sha256').update(stateValue).digest('hex')]
    )).rows[0];
  } catch (e) {
    console.error('OAuth state validation failed:', e.message);
    return res.redirect(`${FRONT || ''}/?connect_error=oauth_state_unavailable`);
  }
  if (!oauth) return res.redirect(`${FRONT || ''}/?connect_error=invalid_or_reused_oauth_state`);
  if (!code) return res.redirect(`${FRONT || ''}/?connect_error=${encodeURIComponent(String(error_description || 'বাতিল করা হয়েছে').slice(0,180))}`);
  try {
    const id = process.env.FACEBOOK_APP_ID, secret = process.env.FACEBOOK_APP_SECRET;
    if (!id || !secret || !REDIRECT || !FRONT) throw new Error('Facebook OAuth environment is not configured');
    const userId = Number(oauth.user_id);
    const workspace = (await pool.query('SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1',[userId])).rows[0];
    if (!workspace) throw new Error('Workspace not found; run database migrations first');
    const short = await gj(`${GRAPH}/oauth/access_token?` + new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: REDIRECT, code }));
    const long = await gj(`${GRAPH}/oauth/access_token?` + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.access_token }));
    const pages = (await gj(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=100`, { headers: { Authorization: `Bearer ${long.access_token}` } })).data || [];

    for (const p of pages) {
      const ex = await pool.query("SELECT id,user_id FROM channels WHERE platform_page_id=$1 AND platform='facebook'", [p.id]);
      if (ex.rows[0] && Number(ex.rows[0].user_id) !== userId) throw new Error('A Facebook page is already connected to another account');
      if (ex.rows[0]) await pool.query('UPDATE channels SET access_token=$1,page_name=$2,user_id=$3,workspace_id=$4 WHERE id=$5', [encryptToken(p.access_token),p.name,userId,workspace.id,ex.rows[0].id]);
      else await pool.query("INSERT INTO channels (platform,platform_page_id,page_name,access_token,user_id,workspace_id) VALUES ('facebook',$1,$2,$3,$4,$5)", [p.id,p.name,encryptToken(p.access_token),userId,workspace.id]);
      fetch(`${GRAPH}/${p.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`, { method: 'POST', headers: { Authorization: `Bearer ${p.access_token}` } })
        .then((r) => r.json()).then((d) => d.error && console.error('Subscribe failed:', p.name, d.error.message)).catch(() => {});
    }
    res.redirect(`${FRONT}/?connected=${pages.length}`);
  } catch (e) {
    console.error('Facebook connect failed:', e.message);
    res.redirect(`${FRONT}/?connect_error=${encodeURIComponent(e.message)}`);
  }
});

router.use(requireAuth, workspaceAccess);

router.get('/facebook/oauth-url', async (req,res,next) => {
  try {
    const id=process.env.FACEBOOK_APP_ID;
    if(!id || !process.env.FACEBOOK_APP_SECRET || !process.env.BACKEND_URL || !FRONT)
      return res.status(503).json({error:'Facebook OAuth is not configured'});
    const state=crypto.randomBytes(32).toString('hex');
    const stateHash=crypto.createHash('sha256').update(state).digest('hex');
    await pool.query(
      `INSERT INTO oauth_states(state_hash,user_id,provider,expires_at)
       VALUES($1,$2,'facebook',NOW()+INTERVAL '10 minutes')`,
      [stateHash,req.user.id]
    );
    const params=new URLSearchParams({client_id:id,redirect_uri:REDIRECT,state,scope:'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement'});
    res.json({url:`https://www.facebook.com/${META_VERSION}/dialog/oauth?${params.toString()}`});
  } catch(e) { next(e); }
});

// Connect an Instagram professional account or WhatsApp Cloud API phone number using an operator-provided token.
// Facebook Pages continue to use the OAuth flow above.
router.post('/channels/meta', asyncHandler(async (req, res) => {
  const platform = String(req.body?.platform || '').toLowerCase();
  const platformId = String(req.body?.platform_id || '').trim();
  const token = String(req.body?.access_token || '').trim();
  const requestedName = String(req.body?.name || '').trim();
  if (!['instagram','whatsapp'].includes(platform)) return res.status(400).json({ error: 'platform must be instagram or whatsapp' });
  if (!platformId || !token || platformId.length > 255 || token.length > 4096) return res.status(400).json({ error: 'platform_id and access_token are required' });
  const workspace = (await pool.query('SELECT w.id FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=$1 AND wm.role IN (\'owner\',\'admin\') ORDER BY w.id LIMIT 1',[req.user.id])).rows[0];
  if (!workspace) return res.status(403).json({ error: 'Workspace owner/admin access required' });
  let profile;
  try {
    const fields = platform === 'whatsapp' ? 'id,display_phone_number,verified_name' : 'id,username,name';
    const response = await fetch(`${GRAPH}/${encodeURIComponent(platformId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    profile = await response.json();
    if (!response.ok || profile.error || String(profile.id) !== platformId) throw new Error(profile.error?.message || 'Provider token could not access this account');
  } catch (e) { return res.status(400).json({ error: `Meta account validation failed: ${String(e.message).slice(0,180)}` }); }
  const pageName = requestedName || profile.name || profile.username || profile.verified_name || profile.display_phone_number || `${platform}-${platformId}`;
  const saved = await pool.query(
    `INSERT INTO channels(platform,platform_page_id,page_name,access_token,user_id,workspace_id)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(platform_page_id) DO UPDATE SET platform=EXCLUDED.platform,page_name=EXCLUDED.page_name,access_token=EXCLUDED.access_token,user_id=EXCLUDED.user_id,workspace_id=EXCLUDED.workspace_id
     WHERE channels.platform=EXCLUDED.platform AND channels.workspace_id=EXCLUDED.workspace_id
     RETURNING id,platform,platform_page_id,page_name`,
    [platform, platformId, pageName.slice(0,255), encryptToken(token), req.user.id, workspace.id]);
  if (!saved.rows[0]) return res.status(409).json({ error: 'This provider account is already connected to another workspace or platform' });
  res.status(201).json(saved.rows[0]);
}));

router.patch('/channels/:id/contacts/:subscriberId/marketing-opt-in', asyncHandler(async (req, res) => {
  const channelId=Number(req.params.id), subscriberId=Number(req.params.subscriberId);
  const optedIn=req.body?.opted_in;
  if(!Number.isInteger(channelId)||!Number.isInteger(subscriberId)||typeof optedIn!=='boolean') return res.status(400).json({error:'channel ID, subscriber ID and boolean opted_in are required'});
  const channel=(await pool.query(`SELECT c.workspace_id,c.platform FROM channels c WHERE c.id=$1 AND c.platform='whatsapp' AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))`,[channelId,req.user.id])).rows[0];
  if(!channel)return res.status(404).json({error:'WhatsApp channel not found or permission denied'});
  const changed=await pool.query('UPDATE subscribers SET marketing_opt_in=$1 WHERE id=$2 AND channel_id=$3 RETURNING id,marketing_opt_in',[optedIn,subscriberId,channelId]);
  if(!changed.rowCount)return res.status(404).json({error:'Contact not found on this channel'});
  await pool.query('INSERT INTO audit_logs(workspace_id,user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',[channel.workspace_id,req.user.id,optedIn?'contact.marketing_opt_in':'contact.marketing_opt_out','subscriber',String(subscriberId),JSON.stringify({channel_id:channelId,source:'operator'})]);
  res.json(changed.rows[0]);
}));

router.delete('/channels/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid channel ID' });
  const removed = await pool.query(
    `DELETE FROM channels c WHERE c.id=$1 AND EXISTS(
       SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin')
     ) RETURNING id`, [id, req.user.id]);
  if (!removed.rowCount) return res.status(404).json({ error: 'Channel not found or admin permission required' });
  res.json({ success: true });
}));


// Global, workspace-scoped search used by the dashboard search dialog.
router.get('/search', asyncHandler(async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 120);
  if (term.length < 2) return res.json({ channels: [], contacts: [], flows: [] });
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const [channels, contacts, flows] = await Promise.all([
    pool.query(`SELECT c.id,c.page_name AS title,c.platform AS detail,'channel' AS type
      FROM channels c JOIN workspace_members wm ON wm.workspace_id=c.workspace_id
      WHERE wm.user_id=$1 AND (c.page_name ILIKE $2 OR c.platform ILIKE $2) ORDER BY c.page_name LIMIT 5`, [req.user.id, pattern]),
    pool.query(`SELECT s.id,s.first_name AS title,s.psid AS detail,'contact' AS type,c.id AS channel_id
      FROM subscribers s JOIN channels c ON c.id=s.channel_id JOIN workspace_members wm ON wm.workspace_id=c.workspace_id
      WHERE wm.user_id=$1 AND (COALESCE(s.first_name,'') ILIKE $2 OR COALESCE(s.last_name,'') ILIKE $2 OR s.psid ILIKE $2) ORDER BY s.id DESC LIMIT 8`, [req.user.id, pattern]),
    pool.query(`SELECT f.id,f.name AS title,COALESCE(c.page_name,'') AS detail,'flow' AS type,c.id AS channel_id
      FROM flows f JOIN channels c ON c.id=f.channel_id JOIN workspace_members wm ON wm.workspace_id=c.workspace_id
      WHERE wm.user_id=$1 AND (f.name ILIKE $2 OR COALESCE(f.trigger_keyword,'') ILIKE $2) ORDER BY f.id DESC LIMIT 5`, [req.user.id, pattern])
  ]);
  res.json({ channels: channels.rows, contacts: contacts.rows, flows: flows.rows });
}));

// Import contacts from a validated CSV/JSON preview. Imports are scoped to a channel
// the authenticated user can manage and upsert on (channel_id, psid).
router.post('/channels/:id/contacts/import', asyncHandler(async (req, res) => {
  const channelId = Number(req.params.id);
  const rows = req.body?.contacts;
  if (!Number.isInteger(channelId) || channelId < 1) return res.status(400).json({ error: 'Invalid channel ID' });
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1000) return res.status(400).json({ error: 'Upload between 1 and 1000 contacts per batch' });
  const channel = (await pool.query(`SELECT c.id,c.platform FROM channels c WHERE c.id=$1 AND EXISTS(
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))`, [channelId, req.user.id])).rows[0];
  if (!channel) return res.status(404).json({ error: 'Channel not found or permission denied' });
  let imported = 0, skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of rows) {
      const psid = String(item?.psid || item?.id || '').trim().slice(0,255);
      if (!psid) { skipped++; continue; }
      const first = String(item?.first_name || item?.firstName || item?.name || '').trim().slice(0,255) || null;
      const last = String(item?.last_name || item?.lastName || '').trim().slice(0,255) || null;
      await client.query(`INSERT INTO subscribers(channel_id,psid,first_name,last_name,status)
        VALUES($1,$2,$3,$4,'active') ON CONFLICT(channel_id,psid) DO UPDATE SET
        first_name=COALESCE(EXCLUDED.first_name,subscribers.first_name),last_name=COALESCE(EXCLUDED.last_name,subscribers.last_name)`, [channelId, psid, first, last]);
      imported++;
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  res.status(200).json({ success: true, imported, skipped, channel_id: channelId });
}));

router.get('/pages', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT c.id,c.page_name,c.platform_page_id,c.platform FROM channels c JOIN workspace_members wm ON wm.workspace_id=c.workspace_id WHERE wm.user_id=$1 ORDER BY c.id DESC', [req.user.id]);
  res.json(r.rows);
}));

router.get('/pages/:id/automations', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT f.id, f.name, f.trigger_keyword, f.flow_data FROM flows f JOIN channels c ON c.id=f.channel_id WHERE f.channel_id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2) ORDER BY f.id DESC', [req.params.id, req.user.id]);
  res.json(r.rows);
}));

router.post('/pages/:id/automations', asyncHandler(async (req, res) => {
  const { keyword, reply } = req.body || {};
  if (!keyword?.trim() || !reply?.trim()) return res.status(400).json({ error: 'কীওয়ার্ড ও রিপ্লাই দিন' });
  const owns = await pool.query('SELECT c.id FROM channels c WHERE c.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.id, req.user.id]);
  if (!owns.rows[0]) return res.status(404).json({error:'Channel not found'});
  const r = await pool.query(
    "INSERT INTO flows (channel_id, name, flow_data, trigger_type, trigger_keyword) VALUES ($1,$2,$3,'keyword',$4) RETURNING id",
    [req.params.id, keyword.trim(), JSON.stringify({ replyText: reply.trim() }), keyword.trim()]
  );
  res.status(201).json(r.rows[0]);
}));

router.delete('/pages/automations/:flowId', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM flows f USING channels c WHERE f.channel_id=c.id AND f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [req.params.flowId, req.user.id]);
  res.json({ success: true });
}));

module.exports = router;
