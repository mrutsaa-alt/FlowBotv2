
const crypto=require('crypto');
function timingSafeStringEqual(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function verifyMetaSignature(rawBody,signature,secret){
  if(!secret||!Buffer.isBuffer(rawBody))return false;
  const expected='sha256='+crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  return timingSafeStringEqual(signature,expected);
}
function verifyStripeSignature(header,rawBody,secret,nowSeconds=Math.floor(Date.now()/1000),tolerance=300){
  if(!secret||!Buffer.isBuffer(rawBody))return false;
  const values=String(header||'').split(',').map(part=>part.split('=').map(x=>x.trim())).filter(pair=>pair.length===2);
  const timestamp=Number(values.find(pair=>pair[0]==='t')?.[1]);
  const signatures=values.filter(pair=>pair[0]==='v1').map(pair=>pair[1]);
  if(!Number.isFinite(timestamp)||Math.abs(nowSeconds-timestamp)>tolerance||!signatures.length)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures.some(sig=>{
    let actual;try{actual=Buffer.from(sig,'hex')}catch{return false;}
    return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
  });
}
module.exports={timingSafeStringEqual,verifyMetaSignature,verifyStripeSignature};
