
const pool = require('../config/db');
const crypto = require('crypto');
const deliveryService = require('./deliveryService');
const aiClient = require('./aiClient');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const asArray = v => Array.isArray(v) ? v : [];
function nextNodeId(current, graph, incomingText, detectedIntent) {
  const edges = asArray(graph.edges).filter(e => e.source === current.id);
  if (!edges.length) return null;
  if (current.data?.kind === 'intent') {
    const intent = String(detectedIntent || '').toLowerCase();
    const edge = edges.find(e => String(e.label || '').toLowerCase() === intent);
    return (edge || edges.find(e => String(e.label || '').toLowerCase() === 'other') || edges[0])?.target || null;
  }
  if (current.data?.kind === 'condition') {
    const needle = String(current.data.content || '').trim().toLocaleLowerCase();
    const yes = !!needle && String(incomingText || '').toLocaleLowerCase().includes(needle);
    const wanted = yes ? 'yes' : 'no';
    const edge = edges.find(e => String(e.label || '').toLowerCase() === wanted) || edges[yes ? 0 : 1] || edges[0];
    return edge?.target || null;
  }
  return edges[0].target;
}

function matchesTrigger(triggerType, keywordValue, incomingText) {
  const incoming = String(incomingText || '').trim().toLocaleLowerCase();
  return triggerType === 'default' ||
    (triggerType === 'welcome' && (/^\/start(?:\s|$)/i.test(incomingText || '') || /^(hi|hello|হাই|হ্যালো)$/i.test(incoming))) ||
    (triggerType === 'keyword' && String(keywordValue || '').split(',').map(keyword => keyword.trim().toLocaleLowerCase()).filter(Boolean).some(keyword => incoming.includes(keyword)));
}

async function execute(executionId, initialContext) {
  const graph = initialContext.flowData || {};
  const nodes = asArray(graph.nodes), byId = new Map(nodes.map(n => [n.id, n]));
  let context = {...initialContext};
  let currentId = context.currentNodeId;
  const visited = new Set(asArray(context.visited));
  try {
    for (let step = 0; step < 201 && currentId; step++) {
      const node = byId.get(currentId);
      if (!node || visited.has(node.id)) break;
      const kind = node.data?.kind;
      // Persist the cursor before delivery, but do not mark the node complete until its action succeeds.
      await pool.query('UPDATE flow_executions SET current_node_id=$1,context=$2,status=$3 WHERE id=$4',
        [node.id, JSON.stringify({...context,currentNodeId:node.id,visited:[...visited]}), 'running', executionId]);
      if (kind === 'message') {
        const text = String(node.data?.content || '').trim();
        if (text) {
          const delivery = await deliveryService.sendMessage(context.channelId, context.senderPsid, text);
          if (context.subscriberId) await pool.query(
            "INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status) VALUES($1,$2,'bot',$3,'text',$4,'sent')",
            [context.channelId, context.subscriberId, text, delivery?.messages?.[0]?.id || delivery?.message_id || null]);
        }
      }
      if (kind === 'ai_reply') {
        const result = await aiClient.processMessage({task:'reply',message:String(context.incomingText || '').slice(0,5000),system_prompt:String(node.data?.systemPrompt || node.data?.content || '').slice(0,2000)});
        const text = result.text.trim().slice(0,5000);
        const delivery = await deliveryService.sendMessage(context.channelId, context.senderPsid, text);
        if (context.subscriberId) await pool.query("INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status) VALUES($1,$2,'bot',$3,'text',$4,'sent')", [context.channelId, context.subscriberId, text, delivery?.messages?.[0]?.id || delivery?.message_id || null]);
        context = {...context,lastAIResponse:text,aiProvider:result.provider};
      }
      if (kind === 'intent') {
        const result = await aiClient.processMessage({task:'intent',message:String(context.incomingText || '').slice(0,5000),intents:Array.isArray(node.data?.intents)?node.data.intents:undefined});
        context = {...context,detectedIntent:result.intent,intentConfidence:result.confidence};
      }
      if (kind === 'delay') {
        visited.add(node.id);
        const seconds = Math.max(1, Math.min(3600, Number(node.data?.seconds) || 5));
        const nextId = nextNodeId(node, graph, context.incomingText, context.detectedIntent);
        if (!nextId) break;
        context = {...context,currentNodeId:nextId,visited:[...visited]};
        await pool.query("UPDATE flow_executions SET status='waiting',current_node_id=$1,context=$2 WHERE id=$3",
          [nextId,JSON.stringify(context),executionId]);
        await pool.query("INSERT INTO flow_jobs(execution_id,run_at) VALUES($1,NOW()+($2 * INTERVAL '1 second'))",
          [executionId,seconds]);
        return 'waiting';
      }
      visited.add(node.id);
      currentId = nextNodeId(node, graph, context.incomingText, context.detectedIntent);
      context = {...context,currentNodeId:currentId,visited:[...visited]};
      await pool.query('UPDATE flow_executions SET current_node_id=$1,context=$2 WHERE id=$3',
        [currentId,JSON.stringify(context),executionId]);
    }
    await pool.query("UPDATE flow_executions SET status='succeeded',finished_at=NOW(),context=$1 WHERE id=$2",
      [JSON.stringify({...context,visited:[...visited]}),executionId]);
    return 'succeeded';
  } catch (e) {
    await pool.query("UPDATE flow_executions SET status='failed',error_message=$1,finished_at=NOW(),context=$2 WHERE id=$3",
      [String(e.message || 'Execution failed').slice(0,2000),JSON.stringify({...context,currentNodeId:currentId,visited:[...visited]}),executionId]).catch(()=>{});
    throw e;
  }
}

async function startExecution({ channelId, subscriberId, senderPsid, incomingText, flow, eventKey = null }) {
  const graph = flow.flow_data || {};
  const nodes = asArray(graph.nodes);
  if (!nodes.length) {
    const type = flow.trigger_type || 'keyword';
    if (!matchesTrigger(type, flow.trigger_keyword, incomingText)) return false;
    if (graph.replyText) {
      const delivery = await deliveryService.sendMessage(channelId, senderPsid, String(graph.replyText));
      await pool.query("INSERT INTO messages(channel_id,subscriber_id,sender_type,message_text,message_type,provider_message_id,delivery_status) VALUES($1,$2,'bot',$3,'text',$4,'sent')",
        [channelId,subscriberId,String(graph.replyText),delivery?.messages?.[0]?.id || delivery?.message_id || null]);
    }
    return Boolean(graph.replyText);
  }
  const trigger = nodes.find(n => n.data?.kind === 'trigger');
  const keyword = String(trigger?.data?.keyword || flow.trigger_keyword || '').trim().toLocaleLowerCase();
  const triggerType = flow.trigger_type || 'keyword';
  if (!matchesTrigger(triggerType, keyword, incomingText)) return false;
  const ctx = { channelId, subscriberId, senderPsid, incomingText, flowData: graph, currentNodeId: trigger.id, visited: [] };
  if (eventKey) {
    const previous = (await pool.query('SELECT id,status,context FROM flow_executions WHERE source_event_key=$1 AND flow_id=$2',[eventKey,flow.id])).rows[0];
    if (previous && ['succeeded','waiting'].includes(previous.status)) return true;
    if (previous && ['failed','running'].includes(previous.status)) {
      await pool.query("UPDATE flow_executions SET status='running',error_message=NULL,finished_at=NULL,started_at=COALESCE(started_at,NOW()) WHERE id=$1",[previous.id]);
      await execute(previous.id,previous.context);
      return true;
    }
  }
  const created = await pool.query(
    `INSERT INTO flow_executions(id,flow_id,flow_version,source_event_key,channel_id,subscriber_id,status,current_node_id,context,started_at)
     VALUES($1,$2,$3,$4,$5,$6,'running',$7,$8,NOW()) ON CONFLICT DO NOTHING RETURNING id`,
    [crypto.randomUUID(),flow.id,flow.version || 1,eventKey,channelId,subscriberId,trigger.id,JSON.stringify(ctx)]);
  if (!created.rows[0]) return true;
  await execute(created.rows[0].id,ctx);
  return true;
}
let workerTimer;
async function runDueJobs() {
  const client = await pool.connect();
  let job;
  try {
    await client.query('BEGIN');
    job = (await client.query(
      `SELECT j.id,j.execution_id,e.context FROM flow_jobs j JOIN flow_executions e ON e.id=j.execution_id
       WHERE j.status='queued' AND j.run_at<=NOW() ORDER BY j.run_at,j.id
       LIMIT 1 FOR UPDATE OF j SKIP LOCKED`
    )).rows[0];
    if (!job) { await client.query('COMMIT'); return; }
    await client.query("UPDATE flow_jobs SET status='running',attempts=attempts+1 WHERE id=$1",[job.id]);
    await client.query("UPDATE flow_executions SET status='running' WHERE id=$1",[job.execution_id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
  try {
    await execute(job.execution_id, job.context);
    await pool.query("UPDATE flow_jobs SET status='done' WHERE id=$1",[job.id]);
  } catch (e) {
    const attempts = (await pool.query('SELECT attempts FROM flow_jobs WHERE id=$1',[job.id])).rows[0]?.attempts || 1;
    if (attempts < 3) {
      await pool.query("UPDATE flow_jobs SET status='queued',run_at=NOW()+($2 * INTERVAL '1 second'),last_error=$3 WHERE id=$1",
        [job.id, Math.pow(2,attempts),String(e.message).slice(0,1000)]);
    } else {
      await pool.query("UPDATE flow_jobs SET status='failed',last_error=$2 WHERE id=$1",[job.id,String(e.message).slice(0,1000)]);
    }
  }
}
function startWorker() {
  if (workerTimer) return;
  pool.query("UPDATE flow_jobs SET status='queued' WHERE status='running'").catch(e=>console.error('Flow job recovery:',e.message));
  workerTimer = setInterval(() => runDueJobs().catch(e => console.error('Flow job worker:',e.message)), 1000);
  workerTimer.unref?.();
}
module.exports = { startExecution, startWorker, runDueJobs, nextNodeId, matchesTrigger };
