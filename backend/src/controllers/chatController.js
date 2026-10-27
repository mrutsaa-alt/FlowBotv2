
const pool = require('../config/db');
const metaService = require('../services/metaService');
const telegramBot = require('../services/telegramBot');
const { decryptToken } = require('../services/tokenCrypto');
const accessPredicate = userParam => `EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=$${userParam})`;
exports.getSubscribers = async (req,res,next) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId < 1) return res.status(400).json({error:'Invalid channel ID'});
    const subs = await pool.query(
      `SELECT s.id,s.psid,s.first_name,s.last_name,s.status,s.bot_paused,s.created_at,s.last_interaction_at,
        lm.message_text AS last_message,lm.created_at AS last_message_at
       FROM subscribers s JOIN channels c ON c.id=s.channel_id
       LEFT JOIN LATERAL (SELECT message_text,created_at FROM messages m WHERE m.subscriber_id=s.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) lm ON TRUE
       WHERE s.channel_id=$1 AND ${accessPredicate(2)} ORDER BY COALESCE(lm.created_at,s.created_at) DESC LIMIT 500`,
      [channelId,req.user.id]);
    res.json(subs.rows);
  } catch(e) { next(e); }
};
exports.getMessages = async (req,res,next) => {
  try {
    const subscriberId = Number(req.params.subscriberId);
    const messages = await pool.query(
      `SELECT m.id,m.sender_type,m.message_text,m.message_type,m.created_at
       FROM messages m JOIN subscribers s ON s.id=m.subscriber_id JOIN channels c ON c.id=s.channel_id
       WHERE s.id=$1 AND ${accessPredicate(2)} ORDER BY m.created_at ASC,m.id ASC LIMIT 500`,
      [subscriberId,req.user.id]);
    res.json(messages.rows);
  } catch(e) { next(e); }
};
exports.sendMessage = async (req,res,next) => {
  try {
    const channelId=Number(req.body?.channel_id), subscriberId=Number(req.body?.subscriber_id);
    const text=String(req.body?.message_text||'').trim();
    if (!Number.isInteger(channelId)||!Number.isInteger(subscriberId)||!text||text.length>5000)
      return res.status(400).json({error:'channel_id, subscriber_id and a message (up to 5000 characters) are required'});
    const result=await pool.query(
      `SELECT s.id,s.psid,s.channel_id,c.platform,c.access_token
       FROM subscribers s JOIN channels c ON c.id=s.channel_id
       WHERE s.id=$1 AND s.channel_id=$2 AND ${accessPredicate(3)}`,
      [subscriberId,channelId,req.user.id]);
    const sub=result.rows[0];
    if(!sub)return res.status(404).json({error:'Subscriber not found'});
    const delivery = sub.platform==='telegram' ? await telegramBot.tg(decryptToken(sub.access_token),'sendMessage',{chat_id:sub.psid,text}) : await metaService.sendMessage(channelId,sub.psid,text);
    const providerMessageId = delivery?.messages?.[0]?.id || delivery?.message_id || null;
    await pool.query(
      "INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status) VALUES($1,$2,'admin',$3,'text',$4,'sent')",
      [channelId,subscriberId,text,providerMessageId]);
    await pool.query('UPDATE subscribers SET bot_paused=TRUE WHERE id=$1',[subscriberId]);
    res.json({success:true});
  } catch(e) { next(e); }
};
