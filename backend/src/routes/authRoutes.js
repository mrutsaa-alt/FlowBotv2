
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { requireAuth, issueSession } = require('../middleware/auth');
const router = express.Router();
const validEmail = v => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const FACEBOOK_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const FACEBOOK_GRAPH = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const frontendUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].replace(/\/$/, '');
const facebookRedirectUrl = () => `${String(process.env.BACKEND_URL || '').replace(/\/$/, '')}/api/auth/facebook-login/callback`;
const hashValue = value => crypto.createHash('sha256').update(value).digest('hex');
const redirectFacebookError = (res, error) => res.redirect(`${frontendUrl()}/?${new URLSearchParams({ facebook_login_error: error })}`);
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) =>
  crypto.scrypt(password, salt, 64, (e, k) => e ? reject(e) : resolve({ salt, hash: k.toString('hex') })));
const verifyPassword = async (password, salt, hash) => {
  const actual = Buffer.from((await hashPassword(password, salt)).hash, 'hex');
  const expected = Buffer.from(hash || '', 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const sessionMeta = req => ({ userAgent: req.get('user-agent'), ip: req.ip });
router.get('/facebook-login-url', async (req, res, next) => {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = facebookRedirectUrl();
    if (!appId || !process.env.FACEBOOK_APP_SECRET || !process.env.BACKEND_URL || !frontendUrl())
      return res.status(503).json({ error: 'Facebook sign-in is not configured on the server.' });
    const state = crypto.randomBytes(32).toString('hex');
    await pool.query("INSERT INTO facebook_login_states(state_hash,expires_at) VALUES($1,NOW()+INTERVAL '10 minutes')", [hashValue(state)]);
    const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, scope: 'public_profile,email' });
    res.json({ url: `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params}` });
  } catch (e) { next(e); }
});

router.get('/facebook-login/callback', async (req, res) => {
  const state = String(req.query.state || '');
  if (!/^[a-f0-9]{64}$/.test(state)) return redirectFacebookError(res, 'failed');
  try {
    const consumed = await pool.query(
      `UPDATE facebook_login_states SET consumed_at=NOW()
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING state_hash`,
      [hashValue(state)]
    );
    if (!consumed.rowCount) return redirectFacebookError(res, 'failed');
    if (req.query.error) return redirectFacebookError(res, 'cancelled');
    if (!req.query.code) return redirectFacebookError(res, 'failed');

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret || !process.env.BACKEND_URL || !frontendUrl()) return redirectFacebookError(res, 'not_configured');
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: facebookRedirectUrl(),
      code: String(req.query.code),
    });
    const tokenResponse = await fetch(`${FACEBOOK_GRAPH}/oauth/access_token?${tokenParams}`, { signal: AbortSignal.timeout(10000) });
    const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
          console.warn('Facebook sign-in token exchange rejected', tokenData.error?.type || 'unknown', tokenData.error?.code || '');
          return redirectFacebookError(res, 'token_exchange_failed');
        }

    const profileResponse = await fetch(`${FACEBOOK_GRAPH}/me?fields=id,name,email`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    const profile = await profileResponse.json();
        if (!profileResponse.ok || profile.error || !profile.id) {
          console.warn('Facebook sign-in profile request rejected', profile.error?.type || 'unknown', profile.error?.code || '');
          return redirectFacebookError(res, 'profile_failed');
        }
    const email = String(profile.email || '').trim().toLowerCase();

    let user = (await pool.query(
      `SELECT u.id,u.name,u.email FROM auth_identities i JOIN users u ON u.id=i.user_id
       WHERE i.provider='facebook' AND i.provider_user_id=$1`, [String(profile.id)]
    )).rows[0];

    if (!user) {
      if (!validEmail(email)) return redirectFacebookError(res, 'email_required');
      const emailOwner = (await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email])).rows[0];
      if (emailOwner) return redirectFacebookError(res, 'account_exists');

      const name = String(profile.name || email.split('@')[0]).trim().slice(0, 120) || 'Facebook user';
      const generatedPassword = await hashPassword(crypto.randomBytes(48).toString('base64url'));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        user = (await client.query(
          'INSERT INTO users(name,email,password_hash,password_salt) VALUES($1,$2,$3,$4) RETURNING id,name,email',
          [name, email, generatedPassword.hash, generatedPassword.salt]
        )).rows[0];
        const workspace = (await client.query(
          'INSERT INTO workspaces(name,owner_user_id) VALUES($1,$2) RETURNING id',
          [`${name}'s Workspace`, user.id]
        )).rows[0];
        await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace.id, user.id]);
        await client.query("INSERT INTO auth_identities(provider,provider_user_id,user_id) VALUES('facebook',$1,$2)", [String(profile.id), user.id]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e.code === '23505') return redirectFacebookError(res, 'account_exists');
        throw e;
      } finally { client.release(); }
    }

    const code = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      "INSERT INTO facebook_login_codes(code_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",
      [hashValue(code), user.id]
    );
    res.redirect(`${frontendUrl()}/?${new URLSearchParams({ facebook_login_code: code })}`);
  } catch (e) {
    console.error('Facebook sign-in failed:', e.message);
    return redirectFacebookError(res, 'failed');
  }
});

router.post('/facebook-login/exchange', async (req, res, next) => {
  try {
    const code = String(req.body?.code || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(code)) return res.status(400).json({ error: 'Facebook sign-in code is invalid or expired.' });
    const consumed = await pool.query(
      `UPDATE facebook_login_codes SET consumed_at=NOW()
       WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id`, [hashValue(code)]
    );
    if (!consumed.rows[0]) return res.status(400).json({ error: 'Facebook sign-in code is invalid or expired.' });
    const user = (await pool.query('SELECT id,name,email FROM users WHERE id=$1', [consumed.rows[0].user_id])).rows[0];
    if (!user) return res.status(400).json({ error: 'Facebook sign-in account is unavailable.' });
    const token = await issueSession(user.id, 43200, sessionMeta(req));
    res.json({ success: true, token, user });
  } catch (e) { next(e); }
});

router.post('/register', async (req, res, next) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!name || !validEmail(email) || typeof password !== 'string' || password.length < 6 || password.length > 256)
    return res.status(400).json({ error: 'নাম, সঠিক ইমেইল এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।' });
  let client;
  try {
    client = await pool.connect();
    const h = await hashPassword(password);
    await client.query('BEGIN');
    const u = (await client.query('INSERT INTO users(name,email,password_hash,password_salt) VALUES($1,$2,$3,$4) RETURNING id,name,email', [name,email,h.hash,h.salt])).rows[0];
    const ws = (await client.query('INSERT INTO workspaces(name,owner_user_id) VALUES($1,$2) RETURNING id,name', [`${name}'s Workspace`,u.id])).rows[0];
    await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws.id,u.id]);
    await client.query('COMMIT');
    const token = await issueSession(u.id, 43200, sessionMeta(req));
    res.status(201).json({ success: true, token, user: u, workspace: ws });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    if (e.code === '23505') return res.status(409).json({ error: 'এই ইমেইল দিয়ে অ্যাকাউন্ট রয়েছে।' });
    next(e);
  } finally { if (client) client.release(); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase(), password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'সঠিক ইমেইল ও পাসওয়ার্ড দিন।' });
    const u = (await pool.query('SELECT id,name,email,password_hash,password_salt FROM users WHERE email=$1', [email])).rows[0];
    if (!u || !u.password_salt || !(await verifyPassword(password, u.password_salt, u.password_hash)))
      return res.status(401).json({ error: 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।' });
    const token = await issueSession(u.id, 43200, sessionMeta(req));
    res.json({ success: true, token, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL', [req.sessionId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [req.user.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
module.exports = router;
