const pool = require('../config/db');

const ownsChannel = async (channelId, userId) => {
  const result = await pool.query('SELECT id FROM channels c WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)', [channelId, userId]);
  return Boolean(result.rows[0]);
};
const { validGraph } = require('../services/flowValidation');
const readBody = (body) => {
  const name = String(body.name || '').trim().slice(0,255);
  const channelId = Number(body.channel_id);
  const flowData = body.flow_data;
  const trigger = (Array.isArray(flowData?.nodes) ? flowData.nodes : []).find(n=>n.data?.kind==='trigger');
  const keyword = String(body.trigger_keyword ?? trigger?.data?.keyword ?? '').trim().slice(0,255);
  const isActive = body.is_active === true;
  const requestedType = String(body.trigger_type || 'keyword');
  const triggerType = ['keyword','welcome','default'].includes(requestedType) ? requestedType : 'keyword';
  if (!Number.isInteger(channelId) || channelId < 1 || !name) return { error:'channel_id and name are required' };
  if (flowData && !validGraph(flowData)) return { error:'Invalid flow graph. Check node types, IDs, connections and node limits.' };
  if (isActive && triggerType === 'keyword' && !keyword) return { error:'A trigger keyword is required before publishing.' };
  return { value:{channelId,name,flowData:flowData || {version:1,nodes:[],edges:[]},keyword,isActive,triggerType} };
};

exports.getFlows = async (req,res,next) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId < 1) return res.status(400).json({error:'Invalid channel ID'});
    if (!await ownsChannel(channelId,req.user.id)) return res.status(404).json({error:'Channel not found'});
    const result = await pool.query('SELECT * FROM flows WHERE channel_id=$1 ORDER BY id DESC',[channelId]);
    res.json(result.rows);
  } catch(e){next(e);}
};
exports.createFlow = async (req,res,next) => {
  try {
    const parsed=readBody(req.body);
    if(parsed.error)return res.status(400).json({error:parsed.error});
    const v=parsed.value;
    if(!await ownsChannel(v.channelId,req.user.id))return res.status(404).json({error:'Channel not found'});
    const result=await pool.query(
      'INSERT INTO flows (channel_id,name,flow_data,trigger_type,trigger_keyword,is_active,published_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $6 THEN NOW() ELSE NULL END) RETURNING *',
      [v.channelId,v.name,JSON.stringify(v.flowData),v.triggerType,v.keyword,v.isActive]);
    if (v.isActive) await pool.query(
      `INSERT INTO flow_versions(flow_id,version,flow_data,trigger_keyword,created_by)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(flow_id,version) DO NOTHING`,
      [result.rows[0].id,result.rows[0].version,JSON.stringify(v.flowData),v.keyword,req.user.id]
    );
    res.status(201).json(result.rows[0]);
  }catch(e){next(e);}
};
exports.updateFlow = async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid flow ID'});
    const parsed=readBody(req.body);
    if(parsed.error)return res.status(400).json({error:parsed.error});
    const v=parsed.value;
    if(!await ownsChannel(v.channelId,req.user.id))return res.status(404).json({error:'Channel not found'});
    const result=await pool.query(
      `UPDATE flows SET channel_id=$1,name=$2,flow_data=$3,trigger_type=$4,trigger_keyword=$5,is_active=$6,
       updated_at=NOW(),published_at=CASE WHEN $6 THEN COALESCE(published_at,NOW()) ELSE NULL END,version=version+1
       WHERE id=$7 AND channel_id IN (SELECT id FROM channels c JOIN workspace_members wm ON wm.workspace_id=c.workspace_id WHERE wm.user_id=$8) RETURNING *`,
      [v.channelId,v.name,JSON.stringify(v.flowData),v.triggerType,v.keyword,v.isActive,id,req.user.id]);
    if(!result.rows[0])return res.status(404).json({error:'Flow not found'});
    if (v.isActive) {
      await pool.query(
        `INSERT INTO flow_versions(flow_id,version,flow_data,trigger_keyword,created_by)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(flow_id,version) DO NOTHING`,
        [result.rows[0].id,result.rows[0].version,JSON.stringify(v.flowData),v.keyword,req.user.id]
      );
    }
    res.json(result.rows[0]);
  }catch(e){next(e);}
};
exports.deleteFlow = async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid flow ID'});
    const result=await pool.query('DELETE FROM flows f USING channels c WHERE f.channel_id=c.id AND f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2) RETURNING f.id',[id,req.user.id]);
    if(!result.rows[0])return res.status(404).json({error:'Flow not found'});
    res.status(204).end();
  }catch(e){next(e);}
};

exports.getExecutions = async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid flow ID'});
    const r=await pool.query(
      `SELECT e.id,e.flow_version,e.status,e.current_node_id,e.error_message,e.started_at,e.finished_at,e.created_at
       FROM flow_executions e JOIN flows f ON f.id=e.flow_id JOIN channels c ON c.id=f.channel_id
       WHERE f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)
       ORDER BY e.created_at DESC LIMIT 100`,[id,req.user.id]);
    res.json(r.rows);
  } catch(e){next(e);}
};
exports.getVersions = async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid flow ID'});
    const r=await pool.query(
      `SELECT v.id,v.version,v.trigger_keyword,v.published_at,v.created_by
       FROM flow_versions v JOIN flows f ON f.id=v.flow_id JOIN channels c ON c.id=f.channel_id
       WHERE f.id=$1 AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2)
       ORDER BY v.version DESC LIMIT 100`,[id,req.user.id]);
    res.json(r.rows);
  } catch(e){next(e);}
};
