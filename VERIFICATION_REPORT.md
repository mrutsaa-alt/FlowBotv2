# FlowBot verification and remaining release gates

## Checks completed in the available build environment

- Backend JavaScript syntax: passed (`cd backend && npm run check`).
- Backend unit tests: 23 passed, 0 failed (`cd backend && npm test`).
- AI service bytecode compilation: passed (`cd ai-service && python -m compileall -q app`).
- AI service unit tests: 3 passed, 0 failed (`cd ai-service && python -m pytest -q`).
- Frontend JavaScript/JSX syntax transpilation: 25 files checked with the installed TypeScript compiler API, 0 syntax diagnostics.
- ZIP integrity: checked after packaging.

## Automated checks added for GitHub Actions

- Clean PostgreSQL 16 service for running all ordered migrations.
- A second migration run to check idempotency.
- Separate frontend production build job.
- AI service compilation and unit tests.

These CI jobs run when pushed to GitHub; their results cannot be claimed until GitHub Actions actually executes them.

## Release gates that require operator configuration or a live environment

1. Run CI and resolve any environment-specific failures.
2. Test registration, login, logout, workspace roles, flow save/publish/run, inbox replies and broadcasts in a browser against a staging PostgreSQL database.
3. Configure and test real Meta App credentials, approved permissions, HTTPS webhook subscriptions, and Facebook/Instagram/WhatsApp accounts. Provider account eligibility and app review cannot be completed from source code alone.
4. Configure and test a real Telegram bot token and outbound/inbound messages.
5. Configure Stripe test-mode product/price and webhook secrets, test subscription lifecycle, and only then configure live mode.
6. Set production secrets using a secret manager, configure HTTPS, backups/restore, monitoring, rate limiting across replicas, and run a security review/load test.

No credentials are embedded in this project. External provider flows and a live database cannot be marked verified without access to the operator's configured accounts and deployment.
