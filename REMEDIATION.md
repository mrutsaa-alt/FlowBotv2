# Flowbot remediation report

## Applied in this patch

- Replaced mock login endpoints with real email/password registration and login using Node `scrypt`, per-user salt, timing-safe password comparison, and signed expiring bearer tokens.
- Added `/api/auth/me` for session validation and removed the frontend's demo-token login path.
- Added an initial workspace/member schema migration and workspace creation during registration.
- Added authentication to private flow, chat, page, and Telegram APIs; added owner-scoped queries to key flow, subscriber, message, and channel operations.
- Reworked Facebook page OAuth to use a short-lived server-signed state and associate connected pages with the authenticated user's workspace.
- Restricted CORS to configured frontend origins, added baseline security headers, a bounded JSON request body, and authentication-request throttling.
- Removed the unsafe default webhook verification token; added optional Meta `X-Hub-Signature-256` validation when `META_APP_SECRET` is configured and preserved the raw request body for validation.
- Changed Meta message sending to use an Authorization header and to propagate provider failures instead of silently reporting success.
- Removed the duplicate Express server implementation; `backend/src/index.js` now delegates to the canonical `backend/server.js`.
- Removed fabricated dashboard metrics and sample inbox/contact records that could be mistaken for live customer data.
- Added `.env.example` values and database migration/setup instructions.

## Required setup before running

1. Apply `database/schema.sql` to a fresh PostgreSQL database.
2. Apply `database/migrations/001_security_workspaces.sql` to that database.
3. Copy `backend/.env.example` to `backend/.env`; configure `DATABASE_URL`, `JWT_SECRET` (at least 32 characters; use a long random secret), `FRONTEND_URL`, `BACKEND_URL`, and provider credentials.
4. Run `npm install` in both `backend` and `frontend`, then run the frontend build and backend checks.
5. Existing channels that have no `user_id` cannot be assigned safely to a user automatically. Reconnect those channels while signed in, or manually verify ownership and backfill them before exposing the data.

## Known work that is not complete

This patch is a security and reliability remediation, not a claim that the entire FlowBot feature set is complete. The following still require dedicated implementation and provider-backed testing:

- Flow Builder persistence, published immutable versions, condition/branch execution, delay scheduling, retry and execution logs.
- Fully API-driven inbox, contact management, broadcasts, analytics and dashboard data; the inbox currently intentionally shows an empty-state message rather than fake conversations.
- Instagram and WhatsApp integrations, provider permission review, and live webhook verification on actual Meta developer accounts.
- Durable campaign/job queue, idempotent webhook/event processing, rate limits per provider, retries and dead-letter handling.
- Encryption of stored provider access tokens at rest, secret rotation, audit logging, workspace invitation/member management, billing, backups and operational monitoring.
- Automated integration tests and an end-to-end production deployment test.

## Validation performed

- `node --check` passed for the modified backend JavaScript files.
- A frontend production build could not be run in this environment because the dependency registry/cache was unavailable (`npm ci --offline` failed on a missing cached package). Run `npm ci && npm run build` in an environment with package registry access before deployment.

## Additional Meta channel integration (implementation update)

- Meta webhook parsing now recognizes Facebook Page, Instagram Messaging, and WhatsApp Cloud API text-message payloads.
- Events are signature-verified, deduplicated, queued, and routed by `(provider, platform account ID)` to the shared flow engine.
- Meta outbound text delivery now selects the appropriate Graph API endpoint/payload for Facebook, Instagram, or WhatsApp.
- Added authenticated `POST /api/channels/meta` for connecting an Instagram professional account or WhatsApp phone-number ID with an operator-provided token. The endpoint validates the token against Graph API and encrypts the stored token. Request JSON: `{ "platform": "instagram" | "whatsapp", "platform_id": "...", "access_token": "...", "name": "optional display name" }`.
- Added unit tests for Facebook, Instagram, and WhatsApp webhook payload parsing.

Limitations: these additions are API/backend foundations, not a claim of full provider approval or production readiness. Instagram and WhatsApp onboarding UI is not yet implemented. Meta app permissions, account eligibility, webhook field subscriptions, WhatsApp templates and 24-hour customer-service window rules, provider rate limits, live sends, media messages, delivery-status synchronization, and full broadcast support still require implementation/configuration and live tests. Never use these endpoints without HTTPS and valid Meta credentials.

## Additional feature work (2026-10-25)
- Added channel onboarding UI for Facebook OAuth and operator-validated Instagram/WhatsApp accounts, plus admin-only disconnect.
- Added WhatsApp explicit marketing opt-in tracking (default false) and audit events.
- Added Meta campaign API/worker with platform policy gates: WhatsApp requires approved template + recorded opt-in; Facebook/Instagram free-form campaign recipients must have interacted within 24 hours.
- Added WhatsApp template and HTTPS media delivery adapters, plus delivery-status storage and webhook extraction for Meta status notifications.
- Added migration 004 for provider message IDs, delivery timestamps, marketing consent and campaign template metadata.
- Tests: backend 23/23 and Python AI tests 3/3 pass; JavaScript syntax check passes. No live provider or DB migration test was possible here.
- Follow-up UI wiring: broadcast composer now selects Telegram/Facebook/Instagram/WhatsApp, shows WhatsApp approved-template fields, and displays policy restrictions; WhatsApp contact consent can be reviewed/toggled in the contacts view. Frontend build still requires `npm ci` and `npm run build` in an environment with package registry access.


## Dashboard usability remediation (2026-10-25)
- Replaced the hardcoded “All systems operational” badge with an authenticated `/api/system/status` check that reports database and AI-service/provider status; the UI refreshes every 30 seconds and displays degraded/unavailable states.
- Added workspace-scoped global search for saved channels, contacts, and flows (`GET /api/search?q=...`) with a search dialog in the top bar.
- Replaced placeholder channel connect alerts with Settings-based setup for Facebook/Instagram/WhatsApp and a working Telegram bot-token connection form that calls the existing validated backend endpoint. Channel cards now load saved connections from the API.
- Added CSV import for up to 1,000 channel contacts per batch (maximum 800 KB per file), with validation, upsert by channel + PSID, result counts, and a workspace-permission check. CSV requires `psid` or `id`; email-only CRM imports are not supported by the current subscriber schema.
- Removed the hardcoded Live Chat badge and demo “all caught up” notification claim. Workspace name and plan are loaded from the workspace/billing API instead of fixed labels.
- Dashboard message/automation counts show loading/error states rather than implying failed requests mean zero.

### Verification after this change
- Backend automated tests: 23 passed, 0 failed.
- Backend JavaScript syntax check: passed.
- Python AI service tests: 3 passed.
- Frontend production build: not verified because Vite is absent from the local `node_modules`; `npm ci --ignore-scripts --prefer-offline` timed out in this environment.
- Live database queries, OAuth/Meta provider actions, Telegram connection, and browser-level interaction require a configured runtime and credentials and were not run here.
