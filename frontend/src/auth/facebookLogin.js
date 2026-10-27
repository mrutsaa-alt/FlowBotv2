/** Start Facebook page connection using a short-lived, server-signed OAuth state. */
export async function startFacebookLogin() {
  const token = localStorage.getItem('flowbot_token');
  if (!token) { window.alert('Please sign in first.'); return; }
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/facebook/oauth-url`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok || !data.url) throw new Error(data.error || 'Facebook connection is not configured.');
    window.location.href = data.url;
  } catch (error) { window.alert(error.message); }
}
