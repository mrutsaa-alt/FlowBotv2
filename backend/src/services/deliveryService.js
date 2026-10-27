
const pool = require('../config/db');
const metaService = require('./metaService');
const { decryptToken } = require('./tokenCrypto');
async function sendMessage(channelId, recipientId, text) {
  const channel = (await pool.query('SELECT platform,access_token FROM channels WHERE id=$1',[channelId])).rows[0];
  if (!channel) throw new Error('Channel not found');
  if (channel.platform === 'telegram') {
    const token = decryptToken(channel.access_token);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:recipientId,text}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const error = new Error(data.description || `Telegram delivery failed (${response.status})`);
      error.status = 502; throw error;
    }
    return data.result;
  }
  return metaService.sendMessage(channelId,recipientId,text);
}
module.exports = { sendMessage };
