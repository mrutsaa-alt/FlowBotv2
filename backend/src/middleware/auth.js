
const pool=require('../config/db');
const {signToken,verifyToken,tokenHash}=require('../services/jwtTokens');
async function issueSession(userId,ttl=43200,meta={}){
  const sid=require('crypto').randomUUID();
  const token=signToken({sub:String(userId),sid},ttl);
  await pool.query(
    `INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,user_agent,ip_address) VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 second'),$5,$6)`,
    [sid,userId,tokenHash(token),ttl,String(meta.userAgent||'').slice(0,500)||null,meta.ip||null]);
  return token;
}
async function requireAuth(req,res,next){
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'');
  if(!match)return res.status(401).json({error:'Authentication required'});
  let payload;
  try{payload=verifyToken(match[1]);}catch{return res.status(503).json({error:'Authentication is not configured'});}
  if(!payload||!payload.sid)return res.status(401).json({error:'Invalid or expired token'});
  try{
    const result=await pool.query(
      `SELECT u.id,u.name,u.email,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.user_id=$2 AND s.token_hash=$3 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
      [payload.sid,payload.sub,tokenHash(match[1])]);
    if(!result.rows[0])return res.status(401).json({error:'Session expired or revoked; sign in again'});
    req.user={id:result.rows[0].id,name:result.rows[0].name,email:result.rows[0].email};
    req.sessionId=result.rows[0].session_id;
    next();
  }catch(e){next(e);}
}
module.exports={signToken,verifyToken,requireAuth,issueSession,tokenHash};
