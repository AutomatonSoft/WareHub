ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS category_main TEXT NULL,
  ADD COLUMN IF NOT EXISTS category_sub TEXT NULL;

CREATE INDEX IF NOT EXISTS intakes_category_main_idx
  ON intakes (category_main);
