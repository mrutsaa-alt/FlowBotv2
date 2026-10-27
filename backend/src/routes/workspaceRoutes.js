
const router = require('express').Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
async function memberRole(workspaceId, userId) {
  return (await pool.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',[workspaceId,userId])).rows[0]?.role || null;
}
router.get('/', async (req,res,next) => {
  try {
    const r = await pool.query(
      `SELECT w.id,w.name,w.created_at,wm.role,
        (SELECT COUNT(*)::int FROM workspace_members x WHERE x.workspace_id=w.id) AS member_count
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id
       WHERE wm.user_id=$1 ORDER BY w.id`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { next(e); }
});
router.get('/:id/members', async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid workspace ID'});
    if(!await memberRole(id,req.user.id))return res.status(404).json({error:'Workspace not found'});
    const r=await pool.query(
      `SELECT u.id,u.name,u.email,wm.role,wm.created_at
       FROM workspace_members wm JOIN users u ON u.id=wm.user_id
       WHERE wm.workspace_id=$1 ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`,[id]);
    res.json(r.rows);
  } catch(e) { next(e); }
});
router.post('/:id/members', async (req,res,next) => {
  const id=Number(req.params.id), email=String(req.body?.email||'').trim().toLowerCase(), role=String(req.body?.role||'agent');
  try {
    if(!Number.isInteger(id)||id<1||!email)return res.status(400).json({error:'Workspace ID and member email are required'});
    const callerRole=await memberRole(id,req.user.id);
    if(!['owner','admin'].includes(callerRole))return res.status(403).json({error:'Workspace admin permission required'});
    if(!['admin','agent','viewer'].includes(role))return res.status(400).json({error:'Role must be admin, agent or viewer'});
    if(role==='admin'&&callerRole!=='owner')return res.status(403).json({error:'Only the owner can assign admin role'});
    const u=(await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
    if(!u)return res.status(404).json({error:'User not found. They must register before being added.'});
    const workspaceOwner=(await pool.query('SELECT owner_user_id FROM workspaces WHERE id=$1',[id])).rows[0]?.owner_user_id;
    if(Number(u.id)===Number(workspaceOwner))return res.status(400).json({error:'The workspace owner role cannot be changed here.'});
    await pool.query('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role',[id,u.id,role]);
    await pool.query('INSERT INTO audit_logs(workspace_id,user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',
      [id,req.user.id,'workspace.member.upsert','user',String(u.id),JSON.stringify({role})]);
    res.status(201).json({success:true,user_id:u.id,role});
  } catch(e) { next(e); }
});
router.delete('/:id/members/:userId', async (req,res,next) => {
  try {
    const id=Number(req.params.id), userId=Number(req.params.userId);
    if(!Number.isInteger(id)||!Number.isInteger(userId))return res.status(400).json({error:'Invalid IDs'});
    if(await memberRole(id,req.user.id)!=='owner')return res.status(403).json({error:'Only the workspace owner can remove members'});
    if(userId===req.user.id)return res.status(400).json({error:'Owner cannot remove themselves'});
    await pool.query('DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',[id,userId]);
    await pool.query('INSERT INTO audit_logs(workspace_id,user_id,action,resource_type,resource_id) VALUES($1,$2,$3,$4,$5)',
      [id,req.user.id,'workspace.member.remove','user',String(userId)]);
    res.json({success:true});
  } catch(e) { next(e); }
});


router.get('/:id/audit', async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid workspace ID'});
    const role=await memberRole(id,req.user.id);
    if(!['owner','admin'].includes(role))return res.status(403).json({error:'Workspace admin permission required'});
    const limit=Math.max(1,Math.min(200,Number(req.query.limit)||100));
    const r=await pool.query(
      `SELECT id,user_id,action,resource_type,resource_id,metadata,created_at
       FROM audit_logs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`,[id,limit]);
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/:id/billing/checkout', async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid workspace ID'});
    const role=await memberRole(id,req.user.id);
    if(!['owner','admin'].includes(role))return res.status(403).json({error:'Workspace owner/admin permission required'});
    const secret=process.env.STRIPE_SECRET_KEY, price=process.env.STRIPE_PRICE_ID;
    const success=process.env.BILLING_SUCCESS_URL, cancel=process.env.BILLING_CANCEL_URL;
    if(!secret||!price||!success||!cancel)return res.status(503).json({error:'Billing is not configured. Set Stripe keys, price ID, and success/cancel URLs on the backend.'});
    const workspace=(await pool.query('SELECT name FROM workspaces WHERE id=$1',[id])).rows[0];
    if(!workspace)return res.status(404).json({error:'Workspace not found'});
    const billing=(await pool.query('SELECT customer_id FROM workspace_billing WHERE workspace_id=$1',[id])).rows[0];
    const params=new URLSearchParams({
      mode:'subscription',
      success_url:success,
      cancel_url:cancel,
      'line_items[0][price]':price,
      'line_items[0][quantity]':'1',
      client_reference_id:String(id),
      'metadata[workspace_id]':String(id),
      'subscription_data[metadata][workspace_id]':String(id),
      'subscription_data[metadata][workspace_name]':workspace.name
    });
    if(billing?.customer_id)params.set('customer',billing.customer_id);
    else params.set('customer_email',req.user.email);
    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded'},body:params
    });
    const data=await response.json();
    if(!response.ok) {
      const error=new Error(data.error?.message||'Stripe checkout session could not be created');
      error.status=502; throw error;
    }
    await pool.query(
      `INSERT INTO workspace_billing(workspace_id,provider,customer_id,subscription_id,plan_key,status,updated_at)
       VALUES($1,'stripe',$2,NULL,'free','checkout_pending',NOW())
       ON CONFLICT(workspace_id) DO UPDATE SET provider='stripe',customer_id=COALESCE(EXCLUDED.customer_id,workspace_billing.customer_id),status='checkout_pending',updated_at=NOW()`,
      [id,data.customer||billing?.customer_id||null]);
    res.json({url:data.url,session_id:data.id});
  } catch(e) { next(e); }
});

router.get('/:id/billing', async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Invalid workspace ID'});
    if(!await memberRole(id,req.user.id))return res.status(404).json({error:'Workspace not found'});
    const r=await pool.query('SELECT plan_key,status,current_period_end,provider FROM workspace_billing WHERE workspace_id=$1',[id]);
    res.json(r.rows[0]||{plan_key:'free',status:'inactive',provider:null,current_period_end:null,billing_configured:false});
  } catch(e) { next(e); }
});
module.exports=router;
