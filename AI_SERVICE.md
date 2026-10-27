# FlowBot Python AI service

This project adds a private FastAPI service for AI Reply and rule-based intent detection. The existing Express backend remains the owner of authentication, workspace access, flow persistence, and message delivery.

## Configure

1. Copy `.env.production.example` to `.env` and fill in the existing required secrets.
2. Set `AI_SERVICE_TOKEN` to a long random secret. It must be the same for the backend and AI service.
3. For generated replies, configure an OpenAI-compatible chat completions endpoint with `LLM_API_URL`, `LLM_API_KEY`, and `LLM_MODEL`. Keep these secrets server-side. Without these values, the `AI Reply` node returns a clear provider-not-configured error; `Intent Detection` uses built-in Bengali/English keyword rules and can run without an LLM provider.
4. Start with `docker compose up --build`.

The AI service is only on the Compose private network; it has no published host port. The backend calls it with `X-AI-Service-Token` and a timeout. Provider failures fail the flow execution and are recorded by the existing execution engine; they do not silently send a fabricated response.

## FlowBuilder nodes

- **AI Reply (Python):** enter instructions in the node settings. It generates a response based on the incoming customer message and sends it through the existing channel delivery service.
- **Intent Detection (Python):** define comma-separated intent labels. Connect outgoing edges and label them with an intent such as `pricing`, `order`, `support`, `complaint`, `human`, or `other`. If no matching label exists, the engine uses the `other` edge or the first outgoing edge.

## Verification

Run `npm test` and `npm run check` from `backend/`. Python tests are in `ai-service/tests/test_main.py`; install `ai-service/requirements.txt` plus `httpx` test dependencies and run `pytest` from `ai-service/`. Live LLM and messaging checks require real credentials and are not covered by mock/local tests.
