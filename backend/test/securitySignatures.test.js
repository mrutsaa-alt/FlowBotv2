
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyMetaSignature,verifyStripeSignature}=require('../src/services/securitySignatures');
test('validates Meta webhook signatures and rejects wrong secrets',()=>{
  const body=Buffer.from('{"object":"page"}'),secret='meta-test-secret';
  const sig='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(verifyMetaSignature(body,sig,secret),true);
  assert.equal(verifyMetaSignature(body,sig,'wrong-secret'),false);
  assert.equal(verifyMetaSignature(body,'sha256=bad',secret),false);
});
test('validates Stripe signatures with timestamp tolerance',()=>{
  const body=Buffer.from('{"type":"test"}'),secret='stripe-test-secret',t=1700000000;
  const sig=crypto.createHmac('sha256',secret).update(`${t}.`).update(body).digest('hex');
  assert.equal(verifyStripeSignature(`t=${t},v1=${sig}`,body,secret,t),true);
  assert.equal(verifyStripeSignature(`t=${t-600},v1=${sig}`,body,secret,t),false);
  assert.equal(verifyStripeSignature(`t=${t},v1=${sig}`,body,'wrong',t),false);
});
