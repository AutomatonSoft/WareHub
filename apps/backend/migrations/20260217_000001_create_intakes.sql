CREATE TABLE IF NOT EXISTS intakes (
  id UUID PRIMARY KEY,
  barcode TEXT NOT NULL,
  warehouse_location TEXT NOT NULL,
  kid_number TEXT NOT NULL,
  photo_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS intakes_barcode_kid_number_uq
  ON intakes (barcode, kid_number);
