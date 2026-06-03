ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users
SET role = 'user'
WHERE role = 'worker';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE LOWER(login) = 'ravil' OR LOWER(username) = 'ravil'
  ) THEN
    UPDATE users
    SET role = 'user';

    UPDATE users
    SET role = 'admin',
        status = 'approved',
        approved_at = COALESCE(approved_at, NOW())
    WHERE LOWER(login) = 'ravil' OR LOWER(username) = 'ravil';
  END IF;
END
$$;
