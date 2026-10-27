const router=require('express').Router();
const pool=require('../config/db');
const {requireAuth}=require('../middleware/auth');
const workspaceAccess=require('../middleware/workspaceAccess');
const worker=require('../services/metaBroadcastWorker');
router.use(requireAuth,workspaceAccess);
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

router.get('/:channelId/broadcasts',h(async(req,res)=>{
  const id=Number(req.params.channelId);
  const rows=await pool.query(`SELECT b.* FROM broadcasts b JOIN channels c ON c.id=b.channel_id WHERE b.channel_id=$1 AND c.platform IN ('facebook','instagram','whatsapp') AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2) ORDER BY b.id DESC LIMIT 50`,[id,req.user.id]);
  res.json(rows.rows);
}));
router.patch('/:channelId/broadcasts/:broadcastId',h(async(req,res)=>{
  const id=Number(req.params.channelId);
  const channel=(await pool.query(`SELECT c.id,c.platform FROM channels c WHERE c.id=$1 AND c.platform IN ('facebook','instagram','whatsapp') AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))`,[id,req.user.id])).rows[0];
  if(!channel)return res.status(404).json({error:'Meta channel not found or permission denied'});
  const name=String(req.body?.name||'Broadcast').trim().slice(0,255),message=String(req.body?.message||'').trim();
  const tagId=req.body?.tag_id?Number(req.body.tag_id):null,templateName=String(req.body?.template_name||'').trim(),templateLanguage=String(req.body?.template_language||'en_US');
  const components=Array.isArray(req.body?.template_components)?req.body.template_components:[];
  if(channel.platform==='whatsapp'){
    if(!/^[a-z0-9_]{1,512}$/i.test(templateName))return res.status(400).json({error:'WhatsApp broadcasts require an approved template name'});
    if(!/^[a-z]{2,3}_[A-Z]{2,3}$/.test(templateLanguage))return res.status(400).json({error:'Invalid template language code'});
    if(components.length>10)return res.status(400).json({error:'Too many template components'});
  } else if(!message||message.length>2000)return res.status(400).json({error:'Facebook/Instagram campaign message is required (max 2000 characters)'});
  if(tagId&&!((await pool.query('SELECT id FROM tags WHERE id=$1 AND channel_id=$2',[tagId,id])).rows[0]))return res.status(400).json({error:'Tag does not belong to this channel'});
  const updated=await pool.query(`UPDATE broadcasts SET name=$1,message_text=$2,tag_id=$3,template_name=$4,template_language=$5,template_components=$6,audience_policy=$7 WHERE id=$8 AND channel_id=$9 AND status='draft' RETURNING *`,[name,message||`WhatsApp template: ${templateName}`,tagId,channel.platform==='whatsapp'?templateName:null,channel.platform==='whatsapp'?templateLanguage:null,JSON.stringify(channel.platform==='whatsapp'?components:[]),channel.platform==='whatsapp'?'whatsapp_opt_in_template':'recent_interaction_24h',req.params.broadcastId,id]);
  if(!updated.rowCount)return res.status(409).json({error:'Only draft campaigns can be edited.'});
  res.json(updated.rows[0]);
}));
router.post('/:channelId/broadcasts/:broadcastId/send',h(async(req,res)=>{
  const id=Number(req.params.channelId);
  const channel=(await pool.query(`SELECT c.id,c.platform FROM channels c WHERE c.id=$1 AND c.platform IN ('facebook','instagram','whatsapp') AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))`,[id,req.user.id])).rows[0];
  if(!channel)return res.status(404).json({error:'Meta channel not found or permission denied'});
  const draft=(await pool.query("SELECT * FROM broadcasts WHERE id=$1 AND channel_id=$2 AND status='draft'",[req.params.broadcastId,id])).rows[0];
  if(!draft)return res.status(409).json({error:'Only draft campaigns can be sent.'});
  const params=[id];let where="s.channel_id=$1 AND COALESCE(s.status,'active')='active'";
  if(channel.platform==='whatsapp')where+=' AND s.marketing_opt_in=TRUE';else where+=" AND s.last_interaction_at >= NOW()-INTERVAL '24 hours'";
  if(draft.tag_id){params.push(draft.tag_id);where+=' AND EXISTS(SELECT 1 FROM subscriber_tags st WHERE st.subscriber_id=s.id AND st.tag_id=$2)';}
  const subs=(await pool.query(`SELECT s.id FROM subscribers s WHERE ${where} ORDER BY s.id LIMIT 10000`,params)).rows;
  if(!subs.length)return res.status(400).json({error:channel.platform==='whatsapp'?'No active contacts with recorded marketing opt-in. Obtain and record consent first.':'No active contacts with an inbound interaction in the last 24 hours.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const locked=(await client.query("SELECT id FROM broadcasts WHERE id=$1 AND channel_id=$2 AND status='draft' FOR UPDATE",[draft.id,id])).rows[0];
    if(!locked){await client.query('ROLLBACK');return res.status(409).json({error:'Draft is no longer available.'});}
    for(const sub of subs)await client.query('INSERT INTO broadcast_recipients(broadcast_id,subscriber_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[draft.id,sub.id]);
    const queued=await client.query("UPDATE broadcasts SET status='queued' WHERE id=$1 RETURNING *",[draft.id]);
    await client.query('COMMIT');
    res.json({...queued.rows[0],recipient_count:subs.length});
    worker.processCampaign(draft.id).catch(e=>console.error('Meta campaign failed:',e.message));
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}));
router.delete('/:channelId/broadcasts/:broadcastId',h(async(req,res)=>{
  const params=[req.params.broadcastId,req.params.channelId,req.user.id];
  const scope=`b.id=$1 AND b.channel_id=$2 AND c.id=b.channel_id AND c.platform IN ('facebook','instagram','whatsapp')
    AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$3 AND wm.role IN ('owner','admin','agent'))`;
  const deleted=await pool.query(`DELETE FROM broadcasts b USING channels c WHERE ${scope} AND b.status<>'sending' RETURNING b.id`,params);
  if(deleted.rowCount)return res.json({success:true});
  const cancelled=await pool.query(`UPDATE broadcasts b SET status='cancel_requested' FROM channels c WHERE ${scope} AND b.status='sending' RETURNING b.id`,params);
  if(!cancelled.rowCount)return res.status(409).json({error:'Campaign not found or unavailable.'});
  res.json({success:true,cancelRequested:true});
}));
router.post('/:channelId/broadcasts',h(async(req,res)=>{
  const id=Number(req.params.channelId);
  const channel=(await pool.query(`SELECT c.id,c.platform FROM channels c WHERE c.id=$1 AND c.platform IN ('facebook','instagram','whatsapp') AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$2 AND wm.role IN ('owner','admin','agent'))`,[id,req.user.id])).rows[0];
  if(!channel)return res.status(404).json({error:'Meta channel not found or permission denied'});
  const name=String(req.body?.name||'Broadcast').trim().slice(0,255);
  const message=String(req.body?.message||'').trim();
  const tagId=req.body?.tag_id?Number(req.body.tag_id):null;
  const templateName=String(req.body?.template_name||'').trim();
  const templateLanguage=String(req.body?.template_language||'en_US');
  const components=Array.isArray(req.body?.template_components)?req.body.template_components:[];
  if(channel.platform==='whatsapp'){
    if(!/^[a-z0-9_]{1,512}$/i.test(templateName))return res.status(400).json({error:'WhatsApp broadcasts require an approved template name'});
    if(!/^[a-z]{2,3}_[A-Z]{2,3}$/.test(templateLanguage))return res.status(400).json({error:'Invalid template language code'});
    if(components.length>10)return res.status(400).json({error:'Too many template components'});
  } else if(!message || message.length>2000) return res.status(400).json({error:'Facebook/Instagram campaign message is required (max 2000 characters)'});
  if(tagId){const tag=(await pool.query('SELECT id FROM tags WHERE id=$1 AND channel_id=$2',[tagId,id])).rows[0];if(!tag)return res.status(400).json({error:'Tag does not belong to this channel'});}
  if(req.body?.save_as_draft){
    const draft=(await pool.query(`INSERT INTO broadcasts(channel_id,name,message_text,tag_id,status,template_name,template_language,template_components,audience_policy)
      VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8) RETURNING *`,[id,name,message||`WhatsApp template: ${templateName}`,tagId,channel.platform==='whatsapp'?templateName:null,channel.platform==='whatsapp'?templateLanguage:null,JSON.stringify(channel.platform==='whatsapp'?components:[]),channel.platform==='whatsapp'?'whatsapp_opt_in_template':'recent_interaction_24h'])).rows[0];
    return res.status(201).json(draft);
  }
  // Enforce provider messaging rules: FB/IG free-form campaigns only target contacts with recent inbound interaction;
  // WhatsApp campaigns only target contacts whose marketing consent was explicitly recorded.
  const params=[id];
  let where="s.channel_id=$1 AND COALESCE(s.status,'active')='active'";
  if(channel.platform==='whatsapp') where+=' AND s.marketing_opt_in=TRUE';
  else where+=" AND s.last_interaction_at >= NOW()-INTERVAL '24 hours'";
  if(tagId){params.push(tagId);where+=' AND EXISTS(SELECT 1 FROM subscriber_tags st WHERE st.subscriber_id=s.id AND st.tag_id=$2)';}
  const subs=(await pool.query(`SELECT s.id FROM subscribers s WHERE ${where} ORDER BY s.id LIMIT 10000`,params)).rows;
  if(!subs.length)return res.status(400).json({error:channel.platform==='whatsapp'?'No active contacts with recorded marketing opt-in. Obtain and record consent first.':'No active contacts with an inbound interaction in the last 24 hours.'});
  const campaign=(await pool.query(`INSERT INTO broadcasts(channel_id,name,message_text,tag_id,status,template_name,template_language,template_components,audience_policy)
    VALUES($1,$2,$3,$4,'queued',$5,$6,$7,$8) RETURNING *`,[id,name,message||`WhatsApp template: ${templateName}`,tagId,channel.platform==='whatsapp'?templateName:null,channel.platform==='whatsapp'?templateLanguage:null,JSON.stringify(channel.platform==='whatsapp'?components:[]),channel.platform==='whatsapp'?'whatsapp_opt_in_template':'recent_interaction_24h'])).rows[0];
  for(const sub of subs) await pool.query('INSERT INTO broadcast_recipients(broadcast_id,subscriber_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[campaign.id,sub.id]);
  res.status(202).json({...campaign,recipient_count:subs.length});
  worker.processCampaign(campaign.id).catch(e=>console.error('Meta campaign failed:',e.message));
}));
module.exports=router;
