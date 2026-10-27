# Project readiness and verification status

This is a **single-project source package** for FlowBot, a messaging automation SaaS starter. It is not yet a production-certified release.

## Included

- React + Vite frontend and visual Flow Builder
- Express API, PostgreSQL schema and ordered migrations
- Registration/login and database-backed sessions
- Workspace access controls, flow validation/execution queue foundations
- Telegram bot integration foundations, Meta webhook verification foundations
- Optional Stripe checkout/webhook foundations
- Docker Compose setup and CI workflow
- Backend unit tests and environment examples

## Verified in this package build

- ZIP archive integrity: checked
- Backend JavaScript syntax: checked with `node --check`
- Backend unit tests: **15 passed, 0 failed** (`node --test` from `backend/`)
- Frontend source imports: checked for missing relative targets

## Not verified / requires setup

- Frontend production build could not be run in this packaging environment because installing npm dependencies timed out. CI runs `npm ci` and `npm run build` on GitHub Actions.
- No live PostgreSQL server was available for migration/integration testing.
- Facebook/Meta, Telegram and Stripe live flows require the operator's own provider credentials and callback/webhook configuration.
- Docker image builds and production deployment were not executed here.

## Before production

1. Install Node.js 20+, npm and Docker (or PostgreSQL 14+).
2. Copy `.env.production.example` to `.env` for Docker, or copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` for local development. Generate unique secrets; never use the example values.
3. Run database migrations and the backend tests.
4. Run `npm ci` in both `backend/` and `frontend/`, then run `npm run build` in `frontend/`.
5. Test registration/login, workspace permissions, flow save/run, message delivery and webhook signatures in staging.
6. Add real provider credentials via environment variables/secret manager, configure HTTPS and backups, then perform security and operational review.

The archive intentionally does not contain `node_modules`, `.env` secrets, or built `dist` output. Those are generated or supplied in the deployment environment.

## Latest implementation delta
- Added provider-aware Meta outbound text delivery for Facebook, Instagram, and WhatsApp Cloud API.
- Added webhook payload extraction and durable queue routing for Instagram and WhatsApp alongside Facebook.
- Added authenticated API endpoint to connect Instagram/WhatsApp accounts with validated and encrypted tokens.
- Backend syntax checks pass; backend tests now report **21 passed, 0 failed** (including four Meta webhook parser tests).
- These are backend integration foundations. Instagram/WhatsApp UI onboarding, live provider testing, policy/template enforcement, media and delivery-status support, and Meta broadcast remain incomplete.

## Latest implementation update (2026-10-25, additional work)
- Replaced the channel settings placeholder with API-driven channel listing and connection UI for Facebook OAuth, Instagram professional accounts, and WhatsApp Cloud API credentials; added admin-only disconnect endpoint.
- Added WhatsApp marketing opt-in state (default false) and an audited endpoint to record opt-in/opt-out. The operator must only record consent actually obtained from the contact.
- Added Meta campaign API/worker. Facebook/Instagram free-form campaigns only include active contacts with inbound interaction in the last 24 hours. WhatsApp campaigns require a named approved template and recorded marketing opt-in. Campaign recipients and outcomes are persisted.
- Added Meta media-send adapter for supported media URLs and WhatsApp approved-template send adapter.
- Added message provider IDs and delivery-status columns; webhook parser now recognizes WhatsApp sent/delivered/read/failed statuses and Facebook delivery/read notifications.
- Added migration `004_meta_messaging_status.sql`.
- Verification after this update: backend tests **23 passed, 0 failed**; `npm run check` passed; Python AI service `compileall` passed and its pytest suite reports **3 passed**.
- Still not verified: frontend production build, migration against a live PostgreSQL database, Meta provider live send/webhook, media/template delivery against approved provider accounts, Stripe lifecycle, production load/security testing. This package is not a claim of complete feature parity with other messaging platforms.
- Added Meta/Telegram-aware broadcast composer UI and WhatsApp contact consent toggle in Contacts. Frontend JSX production build remains unverified because frontend dependencies are not installed in this environment.


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
