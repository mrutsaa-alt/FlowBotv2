/** Google OAuth redirect helper. Configure VITE_GOOGLE_CLIENT_ID in frontend/.env. */
export function startGoogleLogin() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    window.alert('Google login is not configured yet. Add VITE_GOOGLE_CLIENT_ID to frontend/.env.');
    return;
  }
  const redirectUri = window.location.origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'email profile',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
