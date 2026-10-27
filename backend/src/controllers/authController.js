// Deprecated legacy OAuth controller. Authentication is implemented in routes/authRoutes.js.
// Keep this module non-authenticating so old imports cannot mint fake identities.
exports.login = (_req,res) => res.status(410).json({error:'Deprecated endpoint. Use /api/auth/register or /api/auth/login.'});
exports.googleLogin = (_req,res) => res.status(410).json({error:'Google OAuth is not configured on the server.'});
exports.facebookCallback = (_req,res) => res.status(410).json({error:'Use the signed OAuth flow in pagesRoutes.'});
