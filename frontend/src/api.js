
export function authHeaders(extra = {}) {
  const token = localStorage.getItem('flowbot_token') || '';
  return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
export async function api(path, options = {}) {
  const headers = authHeaders({ ...(options.headers || {}) });
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export async function loadChannels() {
  const [pagesResult, botsResult] = await Promise.allSettled([
    api('/api/pages'),
    api('/api/telegram/bots')
  ]);
  if (pagesResult.status === 'rejected' && botsResult.status === 'rejected') {
    throw new Error(pagesResult.reason?.message || botsResult.reason?.message || 'Could not load connected channels');
  }
  const pages = pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value) ? pagesResult.value : [];
  const bots = botsResult.status === 'fulfilled' && Array.isArray(botsResult.value) ? botsResult.value : [];
  const merged = [...pages];
  for (const bot of bots) if (!merged.some(c => String(c.id) === String(bot.id))) merged.push({ ...bot, platform: 'telegram' });
  return merged;
}
