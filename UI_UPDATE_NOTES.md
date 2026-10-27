# Flowbot UI update notes

## Changed in this pass
- Redesigned the login/register screen with a responsive split layout, product preview, updated form controls, show/hide password, clearer loading/error states, and language selector.
- Added visible Google, Facebook, and Telegram sign-in options to the login screen.
- Kept the existing email/password API flow intact.
- Social sign-in buttons intentionally explain that provider setup is still required. They are **not functional authentication providers yet**: the backend currently implements email/password sessions and a Facebook Page connection flow, not consumer Facebook login. Google ID-token verification and Telegram Login Widget verification still need dedicated server-side auth routes and credentials.

## Checks
- Backend automated tests: 23 passed, 0 failed.
- Backend JavaScript syntax check: passed.
- Frontend production build: not completed because `npm ci` timed out in this environment; run `npm ci && npm run build` in an environment with registry access.
- No live PostgreSQL, OAuth provider, or browser end-to-end tests were run.

## Important before production
Do not treat the social buttons as working sign-in until each provider's identity response is verified on the backend, a Flowbot session is issued, and account/workspace linking rules are tested. Never accept a provider access token from the browser as proof of identity without server-side validation.
