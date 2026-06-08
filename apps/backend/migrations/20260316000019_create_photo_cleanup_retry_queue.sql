CREATE TABLE IF NOT EXISTS photo_cleanup_retry_queue (
  photo_url TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT NULL,
  last_request_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photo_cleanup_retry_queue_next_attempt_idx
  ON photo_cleanup_retry_queue (next_attempt_at ASC);
