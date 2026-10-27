
const crypto=require('crypto');
function secret(){
  const s=process.env.JWT_SECRET;
  if(!s||s.length<32)throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return s;
}
function signToken(payload,ttl=43200){
  const now=Math.floor(Date.now()/1000);
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const b=Buffer.from(JSON.stringify({...payload,iat:now,exp:now+ttl})).toString('base64url');
  const data=`${h}.${b}`;
  return `${data}.${crypto.createHmac('sha256',secret()).update(data).digest('base64url')}`;
}
function verifyToken(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)return null;
  let expected,actual,header,payload;
  try{
    expected=crypto.createHmac('sha256',secret()).update(`${parts[0]}.${parts[1]}`).digest();
    actual=Buffer.from(parts[2],'base64url');
    if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
    header=JSON.parse(Buffer.from(parts[0],'base64url'));
    payload=JSON.parse(Buffer.from(parts[1],'base64url'));
  }catch{return null;}
  if(header.alg!=='HS256'||!payload.sub||!payload.exp||payload.exp<=Date.now()/1000||payload.iat>Date.now()/1000+60)return null;
  return payload;
}
const tokenHash=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
module.exports={signToken,verifyToken,tokenHash};
