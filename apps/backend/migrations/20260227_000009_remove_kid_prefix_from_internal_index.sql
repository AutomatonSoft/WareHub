UPDATE intakes
SET internal_index = regexp_replace(internal_index, '^([0-9]+)-KID-', '\1-', 'i')
WHERE internal_index IS NOT NULL;
