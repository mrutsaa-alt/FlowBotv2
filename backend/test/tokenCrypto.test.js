
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const { encryptToken, decryptToken, isEncrypted } = require('../src/services/tokenCrypto');
test('encrypts and decrypts provider tokens', () => {
  const plain='123456:example-provider-token';
  const encrypted=encryptToken(plain);
  assert.notEqual(encrypted,plain);
  assert.equal(isEncrypted(encrypted),true);
  assert.equal(decryptToken(encrypted),plain);
});
test('encryption is idempotent and legacy plaintext remains readable', () => {
  const encrypted=encryptToken('abc');
  assert.equal(encryptToken(encrypted),encrypted);
  assert.equal(decryptToken('legacy-token'),'legacy-token');
});
test('rejects tampered ciphertext', () => {
  const encrypted=encryptToken('secret');
  const parts=encrypted.split('.');
  parts[2]=Buffer.from('tampered').toString('base64url');
  assert.throws(()=>decryptToken(parts.join('.')));
});
