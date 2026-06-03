CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS password_reset_codes_email_idx
  ON password_reset_codes(email);

CREATE INDEX IF NOT EXISTS password_reset_codes_expires_idx
  ON password_reset_codes(expires_at);
