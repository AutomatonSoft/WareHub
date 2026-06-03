ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

UPDATE intakes
SET removed_at = NOW()
WHERE is_removed = TRUE
  AND removed_at IS NULL;

UPDATE intakes
SET removed_at = NULL
WHERE is_removed = FALSE
  AND removed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intakes_removed_at
ON intakes (removed_at)
WHERE is_removed = TRUE;
