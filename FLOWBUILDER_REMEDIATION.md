# FlowBot remediation notes — 2026-10-26

## Changes in this update
- Flow Builder API defaults to same-origin `/api` instead of hard-coded `http://localhost:5000/api`, fixing the most likely cause of `Failed to fetch` in hosted previews when the backend is proxied on the same origin.
- Flow Builder canvas height is constrained to the app viewport instead of always claiming `100vh`, so it can sit inside the application shell without extending below it.
- Added responsive workspace classes and CSS rules for tablet/mobile layouts and improved React Flow control styling.
- Dragging a node marks the graph as dirty so position changes are reflected in the unsaved state.
- Automation list now uses the existing `/api/flows/:channelId` backend routes rather than legacy Telegram-only routes.
- Publish/unpublish now uses the backend's supported `PUT /api/flows/:id` endpoint and includes the existing flow data.

## Verification status
- ZIP archive integrity check passes.
- Backend flow route/controller was inspected; GET/POST/PUT/DELETE endpoints exist at `/api/flows`.
- Frontend dependency installation (`npm ci`) timed out in this environment, so a Vite production build and browser-level end-to-end test could not be completed here.
- Live API calls still require the backend server, valid session, connected channel, and database to be running. This archive does not include real provider credentials.

## Deployment notes
- For a same-origin deployment, route `/api` to the Express backend (Vite dev proxy already targets `http://localhost:5000` by default).
- If the API is on a separate host, set `VITE_API_URL` to its API base URL.
