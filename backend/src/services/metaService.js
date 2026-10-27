const axios = require('axios');
const pool = require('../config/db');
const { decryptToken } = require('./tokenCrypto');

const VERSION = () => process.env.META_GRAPH_API_VERSION || 'v26.0';
async function getChannel(channelId) {
  const r = await pool.query('SELECT id,access_token,platform,platform_page_id FROM channels WHERE id=$1', [channelId]);
  const c = r.rows[0];
  if (!c?.access_token) throw new Error('No access token configured for this channel');
  if (!['facebook','instagram','whatsapp'].includes(c.platform)) throw new Error(`Unsupported Meta platform: ${c.platform}`);
  return { ...c, token: decryptToken(c.access_token) };
}
function graphError(e, platform) {
  const message = e.response?.data?.error?.message || e.message || 'Provider request failed';
  const err = new Error(`Meta ${platform} delivery failed: ${message}`);
  err.status = e.response ? 502 : 500;
  err.providerCode = e.response?.data?.error?.code;
  throw err;
}
async function post(c, url, body) {
  try {
    const r = await axios.post(url, body, { headers: { Authorization: `Bearer ${c.token}` }, timeout: 15000 });
    return r.data;
  } catch (e) { graphError(e, c.platform); }
}

async function assertCustomerServiceWindow(channelId, recipientId, platform) {
  const r = await pool.query(`SELECT last_interaction_at FROM subscribers WHERE channel_id=$1 AND psid=$2`, [channelId, String(recipientId)]);
  const last = r.rows[0]?.last_interaction_at;
  if (!last || Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000) {
    const err = new Error(platform === 'whatsapp'
      ? 'WhatsApp free-form messages require a customer interaction within the last 24 hours; use an approved template outside this window.'
      : `${platform} messaging requires an eligible recent customer interaction (24-hour window).`);
    err.status = 409;
    throw err;
  }
}

function urlFor(c) {
  const root = `https://graph.facebook.com/${VERSION()}`;
  return c.platform === 'whatsapp'
    ? `${root}/${encodeURIComponent(c.platform_page_id)}/messages`
    : c.platform === 'instagram'
      ? `${root}/${encodeURIComponent(c.platform_page_id)}/messages`
      : `${root}/me/messages`;
}

/** Send a free-form text reply. Facebook/Instagram delivery is only appropriate when provider policy permits it. */
exports.sendMessage = async (channelId, recipientId, messageText) => {
  if (!channelId || !recipientId || typeof messageText !== 'string' || !messageText.trim()) throw new Error('channel, recipient and message are required');
  const c = await getChannel(channelId);
  await assertCustomerServiceWindow(channelId, recipientId, c.platform);
  const text = messageText.trim().slice(0, c.platform === 'whatsapp' ? 4096 : 2000);
  const body = c.platform === 'whatsapp'
    ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(recipientId), type: 'text', text: { preview_url: false, body: text } }
    : { recipient: { id: String(recipientId) }, message: { text } };
  return post(c, urlFor(c), body);
};

/** WhatsApp business-initiated messages must use an approved template. This method intentionally only supports template messages. */
exports.sendWhatsAppTemplate = async (channelId, recipientId, template) => {
  if (!channelId || !recipientId) throw new Error('channel and recipient are required');
  if (!template || !/^[a-z0-9_]{1,512}$/i.test(String(template.name || ''))) throw new Error('A valid approved WhatsApp template name is required');
  const language = String(template.language || 'en_US');
  if (!/^[a-z]{2,3}_[A-Z]{2,3}$/.test(language)) throw new Error('Invalid template language code');
  const components = Array.isArray(template.components) ? template.components : [];
  if (components.length > 10) throw new Error('Too many template components');
  const c = await getChannel(channelId);
  if (c.platform !== 'whatsapp') throw new Error('Approved template sending is only supported for WhatsApp channels');
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(recipientId), type: 'template', template: { name: String(template.name), language: { code: language }, ...(components.length ? { components } : {}) } };
  return post(c, urlFor(c), body);
};

/** Send a media URL to supported Meta messaging channels. URL must be publicly reachable over HTTPS. */
exports.sendMedia = async (channelId, recipientId, media) => {
  if (!channelId || !recipientId || !media || typeof media.url !== 'string') throw new Error('channel, recipient and media URL are required');
  let parsed;
  try { parsed = new URL(media.url); } catch { throw new Error('Invalid media URL'); }
  if (parsed.protocol !== 'https:') throw new Error('Media URL must use HTTPS');
  const type = String(media.type || 'image').toLowerCase();
  if (!['image','video','audio','document'].includes(type)) throw new Error('Unsupported media type');
  const c = await getChannel(channelId);
  await assertCustomerServiceWindow(channelId, recipientId, c.platform);
  if (c.platform === 'whatsapp') {
    const item = { link: parsed.href };
    if (type === 'document' && media.filename) item.filename = String(media.filename).slice(0,255);
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(recipientId), type, [type]: item };
    if (media.caption && ['image','video','document'].includes(type)) body[type].caption = String(media.caption).slice(0,1024);
    return post(c, urlFor(c), body);
  }
  if (type === 'audio' || type === 'document') throw new Error(`${type} media is not supported by this channel adapter`);
  const attachment = { type, payload: { url: parsed.href, is_reusable: true } };
  if (media.caption) attachment.payload.caption = String(media.caption).slice(0,1000);
  return post(c, urlFor(c), { recipient: { id: String(recipientId) }, message: { attachment } });
};
