ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS internal_index TEXT NULL;

UPDATE intakes
SET internal_index = CONCAT(
  COALESCE(unit_index, 1)::TEXT,
  '-',
  kid_number,
  '-',
  COALESCE(order_id, split_part(qr_code, '|', 1), 'NOORDER')
)
WHERE internal_index IS NULL;

CREATE INDEX IF NOT EXISTS intakes_internal_index_idx
  ON intakes (internal_index);

CREATE INDEX IF NOT EXISTS intakes_kid_order_idx
  ON intakes (kid_number, order_id, created_at DESC);
