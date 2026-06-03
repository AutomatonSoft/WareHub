DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'intakes'
      AND column_name = 'barcode'
  ) THEN
    ALTER TABLE intakes RENAME COLUMN barcode TO qr_code;
  END IF;
END $$;

DROP INDEX IF EXISTS intakes_barcode_kid_number_uq;

CREATE UNIQUE INDEX IF NOT EXISTS intakes_qr_code_kid_number_uq
  ON intakes (qr_code, kid_number);
