-- Spec §6.2: RBIA engagements require a branch; head-office audits are out
-- of scope for 2.0. Idempotent: drop-then-add so bootstrap can rerun.
ALTER TABLE "AuditEngagement" DROP CONSTRAINT IF EXISTS rbia_requires_branch;
ALTER TABLE "AuditEngagement" ADD CONSTRAINT rbia_requires_branch
  CHECK ("auditType" <> 'RBIA' OR "branchId" IS NOT NULL);
