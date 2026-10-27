
const {verifyStripeSignature}=require('../services/securitySignatures');
const pool=require('../config/db');
exports.handleStripe=async(req,res)=>{
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret)return res.status(503).json({error:'Stripe webhook is not configured'});
  const header=req.get('stripe-signature')||'';
  const raw=req.rawBody||Buffer.from('');
  if(!verifyStripeSignature(header,raw,secret))return res.status(401).json({error:'Invalid or expired Stripe signature'});
  let event;try{event=JSON.parse(raw.toString('utf8'))}catch{return res.status(400).json({error:'Invalid event payload'})}
  try{
    const object=event.data?.object||{};
    if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
      const workspaceId=Number(object.metadata?.workspace_id);
      if(!Number.isInteger(workspaceId)||workspaceId<1)return res.status(200).json({received:true,ignored:true});
      const active=['active','trialing'].includes(object.status);
      const end=object.current_period_end?new Date(object.current_period_end*1000).toISOString():null;
      await pool.query(
        `INSERT INTO workspace_billing(workspace_id,provider,customer_id,subscription_id,plan_key,status,current_period_end,updated_at)
         VALUES($1,'stripe',$2,$3,$4,$5,$6,NOW())
         ON CONFLICT(workspace_id) DO UPDATE SET provider='stripe',customer_id=EXCLUDED.customer_id,
          subscription_id=EXCLUDED.subscription_id,plan_key=EXCLUDED.plan_key,status=EXCLUDED.status,
          current_period_end=EXCLUDED.current_period_end,updated_at=NOW()`,
        [workspaceId,String(object.customer||''),String(object.id||''),active?'pro':'free',String(object.status||'inactive'),end]);
    } else if(event.type==='checkout.session.completed'){
      const workspaceId=Number(object.metadata?.workspace_id||object.client_reference_id);
      if(Number.isInteger(workspaceId)&&workspaceId>0){
        await pool.query(
          `INSERT INTO workspace_billing(workspace_id,provider,customer_id,subscription_id,plan_key,status,updated_at)
           VALUES($1,'stripe',$2,$3,'free','checkout_completed',NOW())
           ON CONFLICT(workspace_id) DO UPDATE SET provider='stripe',customer_id=COALESCE(EXCLUDED.customer_id,workspace_billing.customer_id),
            subscription_id=COALESCE(EXCLUDED.subscription_id,workspace_billing.subscription_id),status=CASE WHEN workspace_billing.status IN ('active','trialing') THEN workspace_billing.status ELSE 'checkout_completed' END,updated_at=NOW()`,
          [workspaceId,object.customer||null,object.subscription||null]);
      }
    }
    res.json({received:true});
  }catch(e){console.error('Stripe webhook processing failed:',e.message);res.status(503).json({error:'Billing event could not be processed'});}
};
