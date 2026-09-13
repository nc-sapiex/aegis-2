-- Idempotent: add @@unique([accountId, providerId]) to Account.
-- Handles three starting states:
--   (a) fresh db — no index, no constraint
--   (b) db:push db — Prisma created the index but no pg_constraint row
--   (c) already-migrated db — constraint present, nothing to do

-- 1. Remove duplicate (accountId, providerId) rows, keeping the most recently updated.
--    No-op when no duplicates exist.
DELETE FROM "Account"
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "accountId", "providerId"
             ORDER BY "updatedAt" DESC, id DESC
           ) AS rn
    FROM "Account"
  ) ranked
  WHERE rn > 1
);

-- 2. Create the unique index if it does not already exist.
--    On a db:push database this is a no-op (index already has this name).
--    On a fresh database it creates the index.
--    On an already-migrated database the promoted index already exists; IF NOT EXISTS makes it a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS "Account_accountId_providerId_key"
  ON "Account" ("accountId", "providerId");

-- 3. Promote the index to a named constraint only when no constraint entry exists yet.
--    Needed for fresh-database path where the index was just created above.
--    On an already-migrated database the pg_constraint row already exists; the block is skipped.
--    On a db:push database the index exists but there is no constraint row, so it is promoted here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Account_accountId_providerId_key'
      AND conrelid = '"Account"'::regclass
  ) THEN
    ALTER TABLE "Account"
      ADD CONSTRAINT "Account_accountId_providerId_key"
        UNIQUE USING INDEX "Account_accountId_providerId_key";
  END IF;
END;
$$;
