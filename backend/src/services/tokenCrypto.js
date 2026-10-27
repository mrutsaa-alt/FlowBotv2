
const crypto = require('crypto');
const PREFIX = 'enc:v1:';
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
  let b;
  try { b = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'); } catch {}
  if (!b || b.length !== 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte base64 or 64-char hex key');
    // Development fallback is intentionally deterministic and must never be used in production.
    return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'flowbot-development-only-key').digest();
  }
  return b;
}
function encryptToken(value) {
  if (typeof value !== 'string' || !value) throw new TypeError('Provider token is required');
  if (value.startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function decryptToken(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext; migrate/rotate it as soon as possible
  const [iv, tag, data] = value.slice(PREFIX.length).split('.');
  if (!iv || !tag || !data) throw new Error('Stored provider token has invalid encrypted format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
module.exports = { encryptToken, decryptToken, isEncrypted: value => typeof value === 'string' && value.startsWith(PREFIX) };
