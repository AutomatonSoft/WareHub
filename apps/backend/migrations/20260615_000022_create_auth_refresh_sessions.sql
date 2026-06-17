CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id UUID PRIMARY KEY,
  token UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  replaced_by_session_id UUID NULL REFERENCES auth_refresh_sessions(id)
);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_user_idx ON auth_refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_refresh_sessions_expires_idx ON auth_refresh_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_refresh_sessions_active_idx
  ON auth_refresh_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
