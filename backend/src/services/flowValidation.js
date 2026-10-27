
const ALLOWED_KINDS = new Set(['trigger', 'message', 'condition', 'delay', 'ai_reply', 'intent']);
function validGraph(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;
  if (data.nodes.length > 200 || data.edges.length > 500) return false;
  const ids = new Set();
  let triggers = 0;
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id)) return false;
    ids.add(node.id);
    if (!node.data || !ALLOWED_KINDS.has(node.data.kind)) return false;
    if (node.data.kind === 'trigger') triggers++;
    if (String(node.data.content || '').length > 5000 || String(node.data.title || '').length > 160) return false;
    if (node.data.kind === 'delay' &&
        (!Number.isFinite(Number(node.data.seconds)) || Number(node.data.seconds) < 1 || Number(node.data.seconds) > 3600)) return false;
    if (node.data.kind === 'message' && typeof node.data.content !== 'string') return false;
    if (node.data.kind === 'ai_reply' && String(node.data.systemPrompt || '').length > 2000) return false;
    if (node.data.kind === 'intent' && node.data.intents !== undefined && (!Array.isArray(node.data.intents) || node.data.intents.length > 30 || node.data.intents.some(x => typeof x !== 'string' || x.length > 60))) return false;
    if (node.data.kind === 'condition' && typeof node.data.content !== 'string') return false;
  }
  if (triggers > 1 || (data.nodes.length > 0 && triggers !== 1)) return false;
  return data.edges.every(e => e && ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
}
module.exports = { validGraph };
