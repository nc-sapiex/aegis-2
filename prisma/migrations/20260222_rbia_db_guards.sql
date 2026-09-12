-- =============================================================================
-- AEGIS RBIA DB Guards
-- =============================================================================
-- Enforces two database-level integrity rules for the v6.0 RBIA schema:
--   1. BranchRbiaScore immutability after freeze (EXAM-11)
--   2. ExaminationNode path/code consistency CHECK constraint
--
-- Apply manually after schema push:
--   psql $DATABASE_URL -f prisma/migrations/20260222_rbia_db_guards.sql
--
-- This script is IDEMPOTENT — safe to run multiple times.
-- =============================================================================


-- ─── 1. BranchRbiaScore Immutability Trigger (EXAM-11) ───────────────────────
-- Prevents ANY update to a frozen score row (frozenAt IS NOT NULL).
-- Uses BEFORE UPDATE to raise an exception BEFORE the write occurs.
-- Application-level guards can be bypassed by direct DB access; this trigger
-- provides an absolute database-level guarantee regardless of access path.

CREATE OR REPLACE FUNCTION prevent_frozen_score_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL THEN
    RAISE EXCEPTION
      'BranchRbiaScore % is frozen (frozenAt = %). Mutations are not permitted.',
      OLD.id,
      OLD."frozenAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_frozen_score_update_trigger ON "BranchRbiaScore";
CREATE TRIGGER prevent_frozen_score_update_trigger
  BEFORE UPDATE ON "BranchRbiaScore"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_frozen_score_update();


-- ─── 2. ExaminationNode Path Integrity CHECK Constraint ───────────────────────
-- Ensures the path field always ends with the node's own code value.
-- Covers both cases:
--   - Root nodes:   path = code              (e.g., path = 'CREDIT', code = 'CREDIT')
--   - Nested nodes: path LIKE '%/' || code   (e.g., path = 'CREDIT/SUB/LEAF', code = 'LEAF')
--
-- Pre-check: verify no existing data violates the constraint before applying:
--   SELECT id, code, path FROM "ExaminationNode"
--   WHERE NOT ("path" LIKE '%/' || code OR "path" = code);
--
-- DO block makes this idempotent (skips if constraint already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'examination_node_path_ends_with_code'
  ) THEN
    ALTER TABLE "ExaminationNode"
      ADD CONSTRAINT "examination_node_path_ends_with_code"
      CHECK ("path" LIKE '%/' || code OR "path" = code);
  END IF;
END
$$;


-- ─── Verification queries (run manually) ─────────────────────────────────────

-- Verify trigger exists on BranchRbiaScore:
--   SELECT trigger_name, event_manipulation, action_timing
--   FROM information_schema.triggers
--   WHERE event_object_table = 'BranchRbiaScore';
--
-- Verify CHECK constraint exists on ExaminationNode:
--   SELECT constraint_name, check_clause
--   FROM information_schema.check_constraints
--   WHERE constraint_name = 'examination_node_path_ends_with_code';
--
-- Test immutability trigger (should raise exception if frozen row exists):
--   UPDATE "BranchRbiaScore" SET "compositeScore" = 0.99
--   WHERE "frozenAt" IS NOT NULL LIMIT 1;
--   -- Expected: ERROR: BranchRbiaScore <id> is frozen (frozenAt = <ts>). Mutations are not permitted.
--
-- Test path CHECK constraint (should fail with constraint violation):
--   INSERT INTO "ExaminationNode" (id, "tenantId", code, path, label, depth, "isActive", "isCritical", weight, "createdAt", "updatedAt")
--   VALUES (gen_random_uuid(), '<tenant-id>', 'BAD', 'WRONG/PATH', 'Test', 0, true, false, 1.0, now(), now());
--   -- Expected: ERROR: new row violates check constraint "examination_node_path_ends_with_code"
