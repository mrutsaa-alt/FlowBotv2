
const test=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='test-only-secret-with-more-than-32-characters';
const {signToken,verifyToken,tokenHash}=require('../src/services/jwtTokens');
test('signs and verifies a valid token',()=>{
  const token=signToken({sub:'42',sid:'session-1'},60);
  const payload=verifyToken(token);
  assert.equal(payload.sub,'42');
  assert.equal(payload.sid,'session-1');
});
test('rejects malformed, tampered, and expired tokens',()=>{
  assert.equal(verifyToken('not.a.jwt'),null);
  const token=signToken({sub:'42',sid:'s'},60);
  const parts=token.split('.'); parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1); assert.equal(verifyToken(parts.join('.')),null);
  assert.equal(verifyToken(signToken({sub:'42',sid:'s'},-1)),null);
});
test('hashes tokens without returning the original token',()=>{
  const token='sensitive-token';
  assert.notEqual(tokenHash(token),token);
  assert.equal(tokenHash(token).length,64);
});
