CREATE TABLE IF NOT EXISTS warehouse_slot_pools (
  section TEXT PRIMARY KEY,
  slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO warehouse_slot_pools (section, slots)
SELECT
  s.section,
  COALESCE(
    jsonb_object_agg(s.warehouse_location, s.internal_index),
    '{}'::jsonb
  ) AS slots
FROM (
  SELECT DISTINCT section, warehouse_location, internal_index
  FROM intakes
  WHERE is_removed = FALSE
    AND warehouse_location IS NOT NULL
    AND internal_index IS NOT NULL
) AS s
GROUP BY s.section
ON CONFLICT (section) DO NOTHING;
