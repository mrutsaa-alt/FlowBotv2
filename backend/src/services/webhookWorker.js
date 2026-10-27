
const pool = require('../config/db');
const botController = require('../controllers/botController');
async function processOne() {
  const client = await pool.connect();
  let event;
  try {
    await client.query('BEGIN');
    event = (await client.query(
      `SELECT id,event_key,payload,attempts FROM webhook_events WHERE provider IN ('facebook','instagram','whatsapp') AND status='queued' AND available_at<=NOW()
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
    )).rows[0];
    if (!event) { await client.query('COMMIT'); return false; }
    await client.query("UPDATE webhook_events SET status='processing',attempts=attempts+1 WHERE id=$1",[event.id]);
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
  try {
    const payload = event.payload;
    const channel = (await pool.query('SELECT id FROM channels WHERE platform=$1 AND platform_page_id=$2',[event.provider,payload.channelPlatformId || payload.pageId])).rows[0];
    if (channel) await botController.processIncomingMessage(channel.id,payload.senderId,payload.text,event.event_key);
    await pool.query("UPDATE webhook_events SET status='processed',processed_at=NOW(),last_error=NULL WHERE id=$1",[event.id]);
  } catch(e) {
    const attempts = Number(event.attempts || 0) + 1;
    const status = attempts >= 5 ? 'failed' : 'queued';
    const backoff = Math.min(60,Math.pow(2,attempts));
    await pool.query("UPDATE webhook_events SET status=$2,last_error=$3,available_at=NOW()+($4 * INTERVAL '1 second') WHERE id=$1",
      [event.id,status,String(e.message || 'Webhook processing failed').slice(0,1000),backoff]);
  }
  return true;
}
let timer;
function startWorker() {
  if (timer) return;
  pool.query("UPDATE webhook_events SET status='queued' WHERE status='processing'").catch(e=>console.error('Webhook recovery:',e.message));
  timer = setInterval(() => processOne().catch(e=>console.error('Webhook worker:',e.message)), 500);
  timer.unref?.();
}
module.exports = { startWorker, processOne };
