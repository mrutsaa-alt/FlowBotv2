const pool = require('../config/db');
const metaService = require('../services/metaService');
const executionEngine = require('../services/executionEngine');

exports.processIncomingMessage = async (channelId, senderPsid, messageText, eventKey = null) => {
  try {
    const subscriberQuery=await pool.query('SELECT id,bot_paused FROM subscribers WHERE channel_id=$1 AND psid=$2',[channelId,senderPsid]);
    let subscriberId=subscriberQuery.rows[0]?.id;
    if(!subscriberId){
      const newSub=await pool.query("INSERT INTO subscribers(channel_id,psid,first_name,status) VALUES($1,$2,$3,'active') RETURNING id",[channelId,senderPsid,'User']);
      subscriberId=newSub.rows[0].id;
    }
    await pool.query("INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_event_key) VALUES($1,$2,'subscriber',$3,'text',$4) ON CONFLICT DO NOTHING",[channelId,subscriberId,messageText,eventKey]);
    await pool.query('UPDATE subscribers SET last_interaction_at=NOW() WHERE id=$1',[subscriberId]);
    if (subscriberQuery.rows[0]?.bot_paused) return;

    const flows=await pool.query(`SELECT * FROM flows WHERE channel_id=$1 AND is_active=TRUE ORDER BY CASE trigger_type WHEN 'keyword' THEN 0 WHEN 'welcome' THEN 1 ELSE 2 END,id DESC`,[channelId]);
    for(const flow of flows.rows){
      const handled=await executionEngine.startExecution({channelId,subscriberId,senderPsid,incomingText:messageText,flow,eventKey});
      if(handled)return;
    }
    const fallback='ধন্যবাদ! আপনার মেসেজটি আমরা পেয়েছি। আমাদের প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবে।';
    const delivery=await metaService.sendMessage(channelId,senderPsid,fallback);
    const providerMessageId=delivery?.messages?.[0]?.id || delivery?.message_id || null;
    await pool.query("INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status) VALUES($1,$2,'bot',$3,'text',$4,'sent')",[channelId,subscriberId,fallback,providerMessageId]);
  } catch(error) {
    console.error('Error processing bot message:',error.message);
    throw error;
  }
};
