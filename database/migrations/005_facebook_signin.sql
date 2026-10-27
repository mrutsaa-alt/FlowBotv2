BEGIN;

CREATE TABLE IF NOT EXISTS auth_identities (
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('facebook')),
  provider_user_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_user_id),
  UNIQUE (provider, user_id)
);

CREATE TABLE IF NOT EXISTS facebook_login_states (
  state_hash CHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_login_codes (
  code_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_login_states_expiry ON facebook_login_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_facebook_login_codes_expiry ON facebook_login_codes(expires_at);

COMMIT;
