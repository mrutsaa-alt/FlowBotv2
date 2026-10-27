const pool = require('../config/db');
const crypto = require('crypto');
const { verifyMetaSignature } = require('../services/securitySignatures');

exports.verifyWebhook = (req, res) => {
  const expected = process.env.WEBHOOK_VERIFY_TOKEN;
  if (!expected) return res.status(503).send('Webhook verification is not configured');
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  const a = Buffer.from(String(token || '')), b = Buffer.from(expected);
  if (mode === 'subscribe' && a.length === b.length && crypto.timingSafeEqual(a,b)) return res.status(200).send(challenge);
  return res.sendStatus(403);
};

const { extractEvents, extractDeliveryUpdates } = require('../services/metaWebhookParser');

exports.handleWebhookEvent = async (req, res) => {
  const body = req.body;
  if (!['page','instagram','whatsapp_business_account'].includes(body?.object)) return res.sendStatus(404);
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return res.status(503).json({ error: 'Set META_APP_SECRET to enable Meta webhook signature validation' });
  const signature = req.get('x-hub-signature-256') || '';
  if (!verifyMetaSignature(req.rawBody || Buffer.from(JSON.stringify(body)), signature, appSecret)) return res.sendStatus(401);
  try {
    let queued = 0;
    let statuses = 0;
    for (const update of extractDeliveryUpdates(body)) {
      if (update.messageId) {
        const status = update.status === 'read' ? 'read' : update.status === 'delivered' ? 'delivered' : update.status === 'failed' ? 'failed' : 'sent';
        const ts = update.timestamp && Number.isFinite(update.timestamp) ? new Date(update.timestamp * 1000) : new Date();
        const r = await pool.query(
          `UPDATE messages SET delivery_status=$1,
             delivered_at=CASE WHEN $1 IN ('delivered','read') THEN COALESCE(delivered_at,$2) ELSE delivered_at END,
             read_at=CASE WHEN $1='read' THEN COALESCE(read_at,$2) ELSE read_at END
           WHERE provider_message_id=$3`, [status, ts, update.messageId]);
        statuses += r.rowCount;
      }
      else if (update.status === 'read' && update.recipientId && update.watermark) {
        const ts = new Date(Number(update.watermark));
        if (Number.isFinite(ts.getTime())) {
          const r = await pool.query(
            `UPDATE messages m SET delivery_status='read',read_at=COALESCE(m.read_at,$1),delivered_at=COALESCE(m.delivered_at,$1)
             FROM subscribers s JOIN channels c ON c.id=s.channel_id
             WHERE m.subscriber_id=s.id AND m.channel_id=c.id AND c.platform=$2 AND s.psid=$3
               AND m.sender_type IN ('bot','admin') AND m.created_at<=$1 AND m.delivery_status<>'read'`,
            [ts, update.provider, update.recipientId]);
          statuses += r.rowCount;
        }
      }
    }
    for (const ev of extractEvents(body)) {
      const eventKey = crypto.createHash('sha256').update(JSON.stringify(ev)).digest('hex');
      const payload = { channelPlatformId: ev.channelPlatformId, senderId: ev.senderId, text: ev.text };
      const inserted = await pool.query(
        `INSERT INTO webhook_events(provider,event_key,payload) VALUES($1,$2,$3)
         ON CONFLICT(provider,event_key) DO UPDATE SET status='queued',attempts=0,available_at=NOW(),last_error=NULL
         WHERE webhook_events.status='failed' RETURNING id`, [ev.provider,eventKey,JSON.stringify(payload)]);
      queued += inserted.rowCount;
    }
    // Acknowledge valid status-only/unsupported event types too; Meta sends delivery/read events.
    return res.status(200).json({ status: 'EVENT_RECEIVED', queued, statuses });
  } catch (e) {
    console.error('Unable to queue Meta webhook:',e.message);
    return res.status(503).json({error:'Webhook queue unavailable; provider may retry'});
  }
};

