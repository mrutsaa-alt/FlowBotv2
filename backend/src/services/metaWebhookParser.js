function extractEvents(body) {
  const out = [];
  if (body?.object === 'page' || body?.object === 'instagram') {
    const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
    for (const entry of body.entry || []) for (const ev of entry.messaging || []) {
      const senderId = ev.sender?.id, text = ev.message?.text;
      if (ev.message?.is_echo || !senderId || typeof text !== 'string' || !text.trim()) continue;
      out.push({ provider: platform, channelPlatformId: String(entry.id), senderId: String(senderId), text: text.slice(0,5000), mid: ev.message?.mid || null, timestamp: ev.timestamp || null });
    }
  } else if (body?.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) for (const change of entry.changes || []) {
      const value = change.value || {}, phoneId = value.metadata?.phone_number_id;
      for (const msg of value.messages || []) {
        const text = msg.text?.body;
        if (!phoneId || !msg.from || typeof text !== 'string' || !text.trim()) continue;
        out.push({ provider: 'whatsapp', channelPlatformId: String(phoneId), senderId: String(msg.from), text: text.slice(0,5000), mid: msg.id || null, timestamp: msg.timestamp || null });
      }
    }
  }
  return out;
}

module.exports = { extractEvents };

function extractDeliveryUpdates(body) {
  const out = [];
  if (body?.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) for (const change of entry.changes || []) {
      for (const status of change.value?.statuses || []) {
        if (status.id && ['sent','delivered','read','failed'].includes(status.status)) {
          out.push({ provider: 'whatsapp', messageId: String(status.id), status: status.status, timestamp: status.timestamp ? Number(status.timestamp) : null, error: status.errors?.[0]?.title || status.errors?.[0]?.message || null });
        }
      }
    }
  } else if (body?.object === 'page' || body?.object === 'instagram') {
    const provider = body.object === 'instagram' ? 'instagram' : 'facebook';
    for (const entry of body.entry || []) for (const ev of entry.messaging || []) {
      const delivery = ev.delivery?.mids || (ev.delivery?.mid ? [ev.delivery.mid] : []);
      for (const id of delivery) out.push({ provider, messageId: String(id), status: 'delivered', timestamp: ev.timestamp ? Math.floor(Number(ev.timestamp) / 1000) : null });
      const read = ev.read?.watermark;
      if (read) out.push({ provider, watermark: Number(read), recipientId: String(ev.sender?.id || ''), status: 'read' });
    }
  }
  return out;
}
module.exports.extractDeliveryUpdates = extractDeliveryUpdates;
