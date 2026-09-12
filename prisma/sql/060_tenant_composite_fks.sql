-- Composite (tenantId, id) foreign keys.
--
-- Prisma relations are ID-only, so a row can carry one tenantId while
-- referencing another tenant's parent. These constraints make that
-- unrepresentable for the four highest-value relations. The application-level
-- guard in src/data-access/tenant-refs.ts still runs first, so callers get a
-- clean error rather than a constraint violation.
--
-- AuditTeamMember.userId is deliberately absent: User.tenantId is nullable,
-- so no composite key can target it. That reference is application-guarded.
--
-- The (tenantId, id) unique indexes these depend on come from schema.prisma
-- and are created by `prisma db push`.
--
-- Pre-check before first application on an existing database:
--   SELECT e.id FROM "AuditEngagement" e
--     JOIN "AuditPlan" p ON p.id = e."auditPlanId"
--    WHERE p."tenantId" <> e."tenantId";
--   -- and the equivalent for Branch, AuditArea, and AuditTeamMember.
--   -- Each must return zero rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_plan_same_tenant') THEN
    ALTER TABLE "AuditEngagement"
      ADD CONSTRAINT "engagement_plan_same_tenant"
      FOREIGN KEY ("tenantId", "auditPlanId")
      REFERENCES "AuditPlan" ("tenantId", "id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_branch_same_tenant') THEN
    ALTER TABLE "AuditEngagement"
      ADD CONSTRAINT "engagement_branch_same_tenant"
      FOREIGN KEY ("tenantId", "branchId")
      REFERENCES "Branch" ("tenantId", "id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_area_same_tenant') THEN
    ALTER TABLE "AuditEngagement"
      ADD CONSTRAINT "engagement_area_same_tenant"
      FOREIGN KEY ("tenantId", "auditAreaId")
      REFERENCES "AuditArea" ("tenantId", "id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_member_engagement_same_tenant') THEN
    ALTER TABLE "AuditTeamMember"
      ADD CONSTRAINT "team_member_engagement_same_tenant"
      FOREIGN KEY ("tenantId", "engagementId")
      REFERENCES "AuditEngagement" ("tenantId", "id") ON DELETE CASCADE;
  END IF;
END
$$;
