
const pool = require('../config/db');
module.exports = async function workspaceAccess(req,res,next) {
  try {
    let channelId = null;
    if (req.params.channelId && /^\d+$/.test(req.params.channelId)) channelId = Number(req.params.channelId);
    else if (req.body?.channel_id && /^\d+$/.test(String(req.body.channel_id))) channelId = Number(req.body.channel_id);
    else if (req.params.cid && /^\d+$/.test(req.params.cid)) channelId = Number(req.params.cid);
    else if (req.params.id && /^\d+$/.test(req.params.id)) {
      if (req.path.startsWith('/flows/') || String(req.baseUrl || '').endsWith('/flows')) {
        channelId = (await pool.query('SELECT channel_id FROM flows WHERE id=$1',[req.params.id])).rows[0]?.channel_id;
      } else if (req.path.startsWith('/bots/') || req.path.startsWith('/pages/')) channelId = Number(req.params.id);
      else if (req.path.startsWith('/tags/')) channelId = (await pool.query('SELECT channel_id FROM tags WHERE id=$1',[req.params.id])).rows[0]?.channel_id;
    } else if (req.params.sid && /^\d+$/.test(req.params.sid)) {
      channelId = (await pool.query('SELECT channel_id FROM subscribers WHERE id=$1',[req.params.sid])).rows[0]?.channel_id;
    } else if (req.params.flowId && /^\d+$/.test(req.params.flowId)) {
      channelId = (await pool.query('SELECT channel_id FROM flows WHERE id=$1',[req.params.flowId])).rows[0]?.channel_id;
    } else if (req.params.id && /^\d+$/.test(req.params.id) && req.path.startsWith('/tags/')) {
      channelId = (await pool.query('SELECT channel_id FROM tags WHERE id=$1',[req.params.id])).rows[0]?.channel_id;
    }
    if (channelId) {
      const r = await pool.query(
        `SELECT wm.role FROM channels c JOIN workspace_members wm ON wm.workspace_id=c.workspace_id
         WHERE c.id=$1 AND wm.user_id=$2`,[channelId,req.user.id]);
      if (!r.rows[0]) return res.status(404).json({error:'Resource not found'});
      req.workspaceRole = r.rows[0].role;
      if (req.method !== 'GET' && req.workspaceRole === 'viewer')
        return res.status(403).json({error:'Viewer role is read-only'});
    } else if (req.method !== 'GET' && req.path.startsWith('/bots')) {
      const r = await pool.query("SELECT role FROM workspace_members WHERE user_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1",[req.user.id]);
      if (!r.rows[0] || r.rows[0].role === 'viewer') return res.status(403).json({error:'Workspace write permission required'});
    }
    next();
  } catch(e) { next(e); }
};
