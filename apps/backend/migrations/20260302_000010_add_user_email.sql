ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (LOWER(email))
  WHERE email IS NOT NULL;
