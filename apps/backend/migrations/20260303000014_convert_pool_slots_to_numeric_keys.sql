UPDATE warehouse_slot_pools AS p
SET
  slots = COALESCE(
    (
      SELECT jsonb_object_agg(n.slot_key, n.slot_value ORDER BY n.slot_key::INT)
      FROM (
        SELECT
          CASE
            WHEN e.key ~ '^[0-9]+$' THEN e.key
            WHEN e.key ~ '^[A-Za-z][0-9]+$' THEN substring(e.key from '[0-9]+$')
            ELSE NULL
          END AS slot_key,
          CASE
            WHEN jsonb_typeof(e.value) = 'array' AND jsonb_array_length(e.value) >= 2 THEN e.value
            WHEN jsonb_typeof(e.value) = 'string' THEN jsonb_build_array(p.section, to_jsonb(e.value #>> '{}'))
            ELSE jsonb_build_array(p.section, to_jsonb(COALESCE(e.value #>> '{}', '')))
          END AS slot_value
        FROM jsonb_each(COALESCE(p.slots, '{}'::jsonb)) AS e
      ) AS n
      WHERE n.slot_key IS NOT NULL
        AND n.slot_key::INT BETWEEN 1 AND 10000
    ),
    '{}'::jsonb
  ),
  updated_at = NOW();
