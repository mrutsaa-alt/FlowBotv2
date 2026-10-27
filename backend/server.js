
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db');
const app = express();
const PORT = Number(process.env.PORT || 5000);
const origins = new Set((process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'))
  .split(',').map(x => x.trim()).filter(Boolean).map(x => new URL(x).origin));
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
if (process.env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL','JWT_SECRET','TOKEN_ENCRYPTION_KEY','FRONTEND_URL','BACKEND_URL','WEBHOOK_VERIFY_TOKEN','META_APP_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) missing.push('JWT_SECRET(minimum 32 chars)');
  if (missing.length) throw new Error(`Missing production configuration: ${[...new Set(missing)].join(', ')}`);
  require('./src/services/tokenCrypto').encryptToken('startup-key-validation');
}
app.use((req,res,next) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-site');
  res.setHeader('Cache-Control','no-store');
  next();
});
const authHits = new Map();
app.use('/api/auth',(req,res,next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown', now = Date.now();
  const row = authHits.get(key) || { start: now, count: 0 };
  if (now - row.start > 900000) { row.start = now; row.count = 0; }
  row.count++; authHits.set(key,row);
  if (row.count > 30) return res.status(429).json({error:'Too many authentication attempts. Try again later.'});
  if (authHits.size > 10000) for (const [k,v] of authHits) if (now-v.start > 900000) authHits.delete(k);
  next();
});
app.use(cors({
  origin(origin,cb) {
    if (!origin) return cb(null,true);
    let requestOrigin;
    try { requestOrigin = new URL(origin).origin; }
    catch { requestOrigin = ''; }
    if (origins.has(requestOrigin)) return cb(null,true);
    const e = new Error('Origin not allowed by CORS'); e.status = 403; e.origin = origin; return cb(e);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Telegram-Bot-Api-Secret-Token']
}));
app.use(express.json({limit:'1mb',verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf)}}));
app.get('/',(_req,res)=>res.json({name:'FlowBot API',status:'ok'}));
app.get('/api/public-config',(_req,res)=>res.json({
  facebookAppId: process.env.FACEBOOK_APP_ID || '',
  webhookUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/$/,'')}/webhook` : '',
  facebookConfigured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.META_APP_SECRET),
  telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
}));
app.get('/health',async(_req,res)=>{
  try { await pool.query('SELECT 1'); res.json({status:'ok',database:'ok'}); }
  catch { res.status(503).json({status:'degraded',database:'unavailable'}); }
});
app.get('/api/system/status',require('./src/middleware/auth').requireAuth,async(_req,res)=>{
  const result={status:'operational',api:'ok',database:'unknown',ai:process.env.AI_SERVICE_URL?'checking':'not_configured',checked_at:new Date().toISOString()};
  try { await pool.query('SELECT 1'); result.database='ok'; }
  catch { result.database='unavailable'; }
  if(process.env.AI_SERVICE_URL){
    try {
      const base=process.env.AI_SERVICE_URL.replace(/\/$/,'');
      const response=await fetch(`${base}/health`,{signal:AbortSignal.timeout(1800)});
      const health=await response.json().catch(()=>({}));
      result.ai=!response.ok?'unavailable':health.provider_configured===false?'provider_not_configured':'ok';
    } catch { result.ai='unavailable'; }
  }
  if(result.database!=='ok'||result.ai==='unavailable') result.status='degraded';
  res.status(result.database==='ok'?200:503).json(result);
});
app.get('/ready',async(_req,res)=>{
  try {
    const r=await pool.query(`SELECT to_regclass('public.schema_migrations') AS migrations,
      to_regclass('public.auth_sessions') AS sessions,to_regclass('public.flow_jobs') AS flow_jobs,
      to_regclass('public.webhook_events') AS webhook_events`);
    const row=r.rows[0];
    if(!row.migrations||!row.sessions||!row.flow_jobs||!row.webhook_events)
      return res.status(503).json({status:'not_ready',reason:'Database migrations are incomplete'});
    res.json({status:'ready',database:'ok',migrations:'ok'});
  } catch { res.status(503).json({status:'not_ready',database:'unavailable'}); }
});
app.use('/api/auth',require('./src/routes/authRoutes'));
app.use('/webhook/stripe',require('./src/routes/billingWebhookRoutes'));
app.use('/webhook',require('./src/routes/webhookRoutes'));
app.use('/api/flows',require('./src/routes/flowRoutes'));
app.use('/api/chat',require('./src/routes/chatRoutes'));
app.use('/api/workspaces',require('./src/routes/workspaceRoutes'));
app.use('/api',require('./src/routes/pagesRoutes'));
app.use('/api/telegram',require('./src/routes/telegramRoutes'));
app.use('/api/meta',require('./src/routes/metaBroadcastRoutes'));
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.use((err,_req,res,_next)=>{
  if (err.origin) console.error('Request failed:',err.message,'Origin:',err.origin);
  else console.error('Request failed:',err.message);
  if(res.headersSent)return;
  const status = Number(err.status) || 500;
  res.status(status).json({error:process.env.NODE_ENV==='production' && status===500?'Internal server error':err.message});
});
const server = app.listen(PORT,()=>{
  console.log(`FlowBot API listening on ${PORT}`);
  require('./src/services/executionEngine').startWorker();
  require('./src/services/webhookWorker').startWorker();
  require('./src/services/metaBroadcastWorker').startWorker();
  require('./src/services/telegramBot').startAll().catch(e=>console.error('Telegram startup failed:',e.message));
});
const stop = () => server.close(()=>pool.end().finally(()=>process.exit(0)));
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
module.exports = { app, server };
