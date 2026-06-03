ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS order_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_sku TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_ean TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_price TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_size TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_color TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_sale_date TEXT NULL,
  ADD COLUMN IF NOT EXISTS order_memo TEXT NULL;

CREATE INDEX IF NOT EXISTS intakes_order_id_created_at_idx
  ON intakes (order_id, created_at DESC);
