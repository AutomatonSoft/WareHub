DROP INDEX IF EXISTS intakes_qr_kid_box_uq;

CREATE UNIQUE INDEX IF NOT EXISTS intakes_qr_kid_unit_box_uq
  ON intakes (qr_code, kid_number, unit_index, box_index);
