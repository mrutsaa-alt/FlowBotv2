
# FlowBot — Messaging Automation SaaS starter

FlowBot is a messaging automation platform with account authentication, workspace membership, Facebook Page and Telegram channel foundations, a visual flow builder, message inbox, contacts, queued Telegram broadcasts, execution logs, optional Stripe subscription checkout, and deployment scaffolding. It is **not yet certified production-ready**; provider credentials, database migrations, and external-service tests are still required.

## Main architecture

- `frontend/` — React/Vite interface, visual Flow Builder, API-driven Inbox/Contacts/Broadcasts.
- `backend/server.js` — single Express server entry point.
- `backend/src/routes/` — authentication, workspace, flow, chat, channel and webhook APIs.
- `backend/src/services/` — token encryption, message delivery, durable flow/webhook workers and provider clients.
- `database/schema.sql` — idempotent base schema.
- `database/migrations/` — ordered schema migrations.
- `backend/test/` — Node.js unit tests for graph validation, JWT primitives, provider signatures and token encryption.
- `docker-compose.yml` — PostgreSQL, backend and frontend containers; terminate HTTPS at a trusted reverse proxy/load balancer.

## Local development

Requirements: Node.js 20+, npm, PostgreSQL 14+.

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env`, then set `DATABASE_URL`, a unique `JWT_SECRET` (at least 32 characters), `TOKEN_ENCRYPTION_KEY` (32-byte base64 or 64-character hex), `FRONTEND_URL`, `BACKEND_URL`, and `WEBHOOK_VERIFY_TOKEN`.
3. From `backend/`, run `npm ci`, then `npm run migrate`. The migration runner bootstraps `database/schema.sql` and applies numbered migrations with checksums.
4. Start the backend with `npm run dev`.
5. Copy `frontend/.env.example` to `frontend/.env`, set `VITE_API_URL=http://localhost:5000`, then from `frontend/` run `npm ci` and `npm run dev`.
6. Register an account in the UI. Login creates a database-backed session; use the UI logout action to revoke it.

### Tests and checks

From `backend/`:

```bash
npm test
npm run check
```

The CI workflow also installs the frontend dependencies and runs `npm run build`. Local frontend production build verification requires a successful `npm ci`.

## Security and operational details

- Passwords are hashed with Node `scrypt`. JWTs are signed with HS256 and tied to revocable database sessions. Session tokens are stored as hashes in the database.
- OAuth state is random, stored hashed in PostgreSQL, expires after 10 minutes, and is consumed once.
- Meta webhook signatures are required; verified incoming events are queued durably and processed by a worker. Telegram bot updates use long polling.
- Provider tokens are saved using AES-256-GCM. Existing plaintext tokens can be encrypted after backup with `cd backend && npm run encrypt-tokens`. Keep the encryption key stable and backed up; losing it makes encrypted provider tokens unreadable.
- Workspace membership is checked for resource access; `viewer` is read-only. Rate limiting is in-process, so multi-replica production deployments should use a shared limiter such as Redis.
- API errors are returned consistently by the server error handler. Production startup fails when core security configuration is missing.
- Do not commit `.env` files or send secrets through chat. Use your hosting platform's secret manager.

## Docker deployment

1. Copy `.env.production.example` to `.env`.
2. Replace every placeholder. Set public `FRONTEND_URL` and `BACKEND_URL`; configure real Meta credentials and a long random webhook verification token. Add Stripe credentials only if subscription billing is needed.
3. Configure DNS and TLS on a trusted reverse proxy/load balancer. The included Compose port is plain HTTP and is not a substitute for TLS.
4. Run `docker compose up --build -d`.
5. Confirm `/health` and `/ready`, verify migrations, and test login/logout before connecting a provider.

## Live provider setup that still requires external credentials

- **Meta/Facebook:** configure `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` on the backend. Register both `${BACKEND_URL}/api/auth/facebook-login/callback` (Facebook sign-in) and `${BACKEND_URL}/api/auth/facebook/callback` (Page connection) as Valid OAuth Redirect URIs. Facebook sign-in requests `public_profile,email`; Page connection requests `pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement`. Also configure the webhook verify token and app secret, subscribe each Page to messaging events, request/review required permissions, and test a real Page send and inbound event in Meta. Graph API version defaults to `v26.0` and can be overridden with `META_GRAPH_API_VERSION`.
- **Telegram:** connect a real BotFather token. FlowBot uses long polling and therefore calls `deleteWebhook` for connected bots; do not configure a competing Telegram webhook for the same bot.
- **Token migration:** take a database backup, set `TOKEN_ENCRYPTION_KEY`, then run `npm run encrypt-tokens` in `backend/`.
- **Stripe billing (optional):** set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (a recurring Price), `STRIPE_WEBHOOK_SECRET`, `BILLING_SUCCESS_URL`, and `BILLING_CANCEL_URL`; configure Stripe to send subscription and checkout events to `${BACKEND_URL}/webhook/stripe`. Test in Stripe test mode before live mode.
- **Database/operations:** validate migrations on a staging copy; test backup restoration; configure log collection, alerts, rate limiting for multiple replicas, dependency audits and a rollback plan.

## Explicit limitations

- Facebook/Telegram live delivery has not been tested here because provider credentials and live channels are unavailable.
- Frontend source syntax was checked, but a full Vite production build could not be verified in this environment because npm dependency installation timed out.
- Stripe integration is optional and requires test-mode verification. Other payment providers are not implemented.
- Instagram DM, WhatsApp, Meta broadcast campaigns, payment reconciliation/refunds, email verification/password reset, Redis-backed queues/rate limits, multi-region deployment, and a formal penetration test remain out of scope.
- Treat this release as a staging candidate, not as a production sign-off. Run the automated suite, database integration tests and real provider delivery tests before handling customer traffic.


## Root convenience scripts

From the project root you can use `npm run install:all`, `npm run dev:backend`, `npm run dev:frontend`, `npm test`, `npm run check:backend`, `npm run build`, and `npm run migrate`. For local development, set up PostgreSQL and environment files first; frontend and backend can also be managed directly from their own folders.

### Codespaces and local development

Run `npm run install:all`, then `npm run dev:local`. The launcher creates or reuses a loopback-only PostgreSQL container, keeps its data in a Docker volume, generates ignored local secrets in `.env.local`, applies migrations, and starts the backend and frontend. Open `http://localhost:5173`; press Ctrl+C to stop the app servers. The database container and volume remain available for the next run. This Linux-only helper avoids Docker bridge networking issues in Codespaces; use the standard Compose setup on other platforms.

See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the checks that have and have not been completed.
