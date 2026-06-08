ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS product_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS slot_number INTEGER NOT NULL DEFAULT 130,
  ADD COLUMN IF NOT EXISTS box_index INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS box_total INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_index INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS intakes_barcode_kid_number_uq;
DROP INDEX IF EXISTS intakes_qr_code_kid_number_uq;

CREATE UNIQUE INDEX IF NOT EXISTS intakes_qr_kid_box_uq
  ON intakes (qr_code, kid_number, box_index);

CREATE INDEX IF NOT EXISTS intakes_product_key_active_idx
  ON intakes (product_key, is_removed, created_at DESC);

CREATE INDEX IF NOT EXISTS intakes_section_slot_active_idx
  ON intakes (section, slot_number, is_removed);
