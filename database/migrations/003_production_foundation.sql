
BEGIN;
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent VARCHAR(500),
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL CHECK(provider IN ('facebook')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS flow_versions (
  id BIGSERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  flow_data JSONB NOT NULL,
  trigger_keyword VARCHAR(255),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(flow_id, version)
);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT 'blue';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_event_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_event_key
  ON messages(provider_event_key) WHERE provider_event_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS flow_executions (
  id UUID PRIMARY KEY,
  flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
  flow_version INTEGER,
  source_event_key VARCHAR(255),
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting','succeeded','failed','cancelled')),
  current_node_id VARCHAR(255),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flow_executions_channel_created ON flow_executions(channel_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_execution_event_flow ON flow_executions(source_event_key,flow_id) WHERE source_event_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS flow_jobs (
  id BIGSERIAL PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES flow_executions(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flow_jobs_due ON flow_jobs(run_at) WHERE status='queued';
CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name VARCHAR(255),
  message_text TEXT NOT NULL,
  tag_id INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id BIGSERIAL PRIMARY KEY,
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  UNIQUE(broadcast_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_queue ON broadcast_recipients(status, id);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(80),
  resource_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_logs(workspace_id, created_at DESC);
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  event_key CHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','processed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider,event_key)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_queue ON webhook_events(status,available_at,id);
CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(32),
  customer_id VARCHAR(255),
  subscription_id VARCHAR(255),
  plan_key VARCHAR(64) NOT NULL DEFAULT 'free',
  status VARCHAR(32) NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
