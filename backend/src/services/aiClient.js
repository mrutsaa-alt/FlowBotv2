const crypto = require('crypto');
const baseUrl = (process.env.AI_SERVICE_URL || 'http://ai-service:8000').replace(/\/$/, '');
async function processMessage(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 18000));
  try {
    const headers = {'Content-Type':'application/json'};
    if (process.env.AI_SERVICE_TOKEN) headers['X-AI-Service-Token'] = process.env.AI_SERVICE_TOKEN;
    const response = await fetch(`${baseUrl}/v1/process`, {method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.detail || `AI service failed (${response.status})`);
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('AI service returned an empty response');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('AI service timed out');
    throw error;
  } finally { clearTimeout(timer); }
}
function safeError(error) { return String(error?.message || 'AI request failed').slice(0,300); }
module.exports = { processMessage, safeError };
