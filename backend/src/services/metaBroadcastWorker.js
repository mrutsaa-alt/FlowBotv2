const pool = require('../config/db');
const metaService = require('./metaService');

let running = false;
async function processCampaign(id) {
  const b = (await pool.query(`SELECT b.*,c.platform FROM broadcasts b JOIN channels c ON c.id=b.channel_id WHERE b.id=$1 AND c.platform IN ('facebook','instagram','whatsapp')`, [id])).rows[0];
  if (!b) return;
  const claimed=await pool.query("UPDATE broadcasts SET status='sending',queued_at=COALESCE(queued_at,NOW()) WHERE id=$1 AND status='queued' RETURNING id", [id]);
  if(!claimed.rowCount){await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[id]);return;}
  const recipients = (await pool.query(`SELECT br.id AS recipient_row_id,br.subscriber_id,s.psid FROM broadcast_recipients br JOIN subscribers s ON s.id=br.subscriber_id WHERE br.broadcast_id=$1 AND br.status IN ('queued','failed') ORDER BY br.id`, [id])).rows;
  let sent=0, failed=0;
  for (const recipient of recipients) {
    const status=(await pool.query('SELECT status FROM broadcasts WHERE id=$1',[id])).rows[0]?.status;
    if(status==='cancel_requested'){
      await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[id]);
      return;
    }
    if(status!=='sending')return;
    try {
      await pool.query("UPDATE broadcast_recipients SET status='sending',attempts=attempts+1 WHERE id=$1",[recipient.recipient_row_id]);
      let result;
      if (b.platform === 'whatsapp') {
        result = await metaService.sendWhatsAppTemplate(b.channel_id, recipient.psid, {name:b.template_name,language:b.template_language,components:b.template_components});
      } else {
        result = await metaService.sendMessage(b.channel_id, recipient.psid, b.message_text);
      }
      const providerId = result?.messages?.[0]?.id || result?.message_id || result?.messageId || null;
      await pool.query("UPDATE broadcast_recipients SET status='sent',sent_at=NOW(),provider_message_id=$2,last_error=NULL WHERE id=$1",[recipient.recipient_row_id,providerId]);
      await pool.query(`INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status)
        VALUES($1,$2,'bot',$3,'broadcast',$4,'sent')`,[b.channel_id,recipient.subscriber_id,b.message_text,providerId]);
      sent++;
    } catch(e) {
      await pool.query("UPDATE broadcast_recipients SET status='failed',last_error=$2 WHERE id=$1",[recipient.recipient_row_id,String(e.message||'Delivery failed').slice(0,1000)]);
      failed++;
    }
  }
  const finished=await pool.query("UPDATE broadcasts SET status='done',sent_count=sent_count+$1,failed_count=failed_count+$2,completed_at=NOW(),last_error=CASE WHEN $2>0 THEN 'One or more deliveries failed' ELSE NULL END WHERE id=$3 AND status='sending' RETURNING id",[sent,failed,id]);
  if(!finished.rowCount)await pool.query("DELETE FROM broadcasts WHERE id=$1 AND status='cancel_requested'",[id]);
}
async function processOne() {
  if (running) return false;
  running=true;
  try {
    const row=(await pool.query(`SELECT b.id FROM broadcasts b JOIN channels c ON c.id=b.channel_id WHERE c.platform IN ('facebook','instagram','whatsapp') AND b.status='queued' ORDER BY b.id LIMIT 1`)).rows[0];
    if (!row) return false;
    await processCampaign(row.id);
    return true;
  } finally { running=false; }
}
function startWorker() {
  pool.query("DELETE FROM broadcasts WHERE status='cancel_requested'").catch(e=>console.error('Meta campaign cancellation recovery:',e.message));
  pool.query("UPDATE broadcasts SET status='queued' WHERE status='sending' AND channel_id IN (SELECT id FROM channels WHERE platform IN ('facebook','instagram','whatsapp'))").catch(e=>console.error('Meta campaign recovery:',e.message));
  const timer=setInterval(()=>processOne().catch(e=>console.error('Meta broadcast worker:',e.message)),1000);
  timer.unref?.();
}
module.exports={startWorker,processOne,processCampaign};
