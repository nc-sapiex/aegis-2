-- Schema additions for the F07–F15 integrity and operations work.
--
-- WHY THIS FILE EXISTS
-- `prisma db push` is not part of the deploy: the container entrypoint is
-- `node server.js` (Dockerfile) and `pnpm start` is `next start`. Nothing
-- applies schema.prisma to production. Merging the F07–F15 code without this
-- file deploys an application that immediately queries columns and tables the
-- database does not have — evidence upload (UploadIntent), notification
-- claiming (NotificationQueue.claimId, read every minute by the
-- process-notifications schedule) and RBIA freeze (ExaminationResponse
-- .isNotApplicable). /api/health checks `SELECT 1` and a pgboss row count, so
-- it stays green while all three are broken.
--
-- ORDER — THIS FILE RUNS BEFORE `pnpm db:bootstrap`
-- `prisma/sql/060_tenant_composite_fks.sql` adds composite foreign keys that
-- reference the `(tenantId, id)` unique indexes created below. Bootstrap the
-- manifest first and 060 fails with "no unique constraint matching given keys".
--
--   1. psql -f prisma/migrations/20260904_f07_f15_schema_additions.sql   (this file)
--   2. run the pre-check queries in prisma/sql/060_tenant_composite_fks.sql
--   3. pnpm db:bootstrap
--   4. merge (Coolify deploys automatically)
--   5. pnpm db:verify
--
-- Idempotent: safe to re-run. Every statement is guarded, so a partial
-- application can be repeated rather than unpicked.
--
-- This is a schema artifact, deliberately NOT in prisma/sql/manifest.ts: the
-- manifest holds objects `prisma db push` cannot create (triggers, views,
-- functions, composite FKs). Tables and columns stay owned by schema.prisma,
-- and this file exists only because production has no push step.

-- ── UploadPurpose enum ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UploadPurpose') THEN
    CREATE TYPE "UploadPurpose" AS ENUM (
      'OBSERVATION_EVIDENCE', 'EXAMINATION_EVIDENCE'
    );
  END IF;
END
$$;

-- ── NotificationQueue.claimId ───────────────────────────────────────────────
-- Atomic claim for competing pg-boss workers. Without it every worker reads the
-- same PENDING batch.
ALTER TABLE "NotificationQueue" ADD COLUMN IF NOT EXISTS "claimId" UUID;
CREATE INDEX IF NOT EXISTS "NotificationQueue_claimId_idx"
  ON "NotificationQueue"("claimId");

-- ── ExaminationResponse: explicit not-applicable ────────────────────────────
-- A null score means "not yet examined"; this means "examined, does not apply".
-- The freeze completeness gate accepts a leaf that has either.
ALTER TABLE "ExaminationResponse"
  ADD COLUMN IF NOT EXISTS "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notApplicableReason" TEXT;

-- ── UploadIntent ────────────────────────────────────────────────────────────
-- Server-issued intent binding an upload to one S3 key, so a confirm cannot
-- attach an arbitrary key.
CREATE TABLE IF NOT EXISTS "UploadIntent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "s3Key" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "parentId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "maxFileSize" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UploadIntent_s3Key_key"
  ON "UploadIntent"("s3Key");
CREATE INDEX IF NOT EXISTS "UploadIntent_tenantId_idx"
  ON "UploadIntent"("tenantId");
CREATE INDEX IF NOT EXISTS "UploadIntent_expiresAt_idx"
  ON "UploadIntent"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UploadIntent_tenantId_fkey'
  ) THEN
    ALTER TABLE "UploadIntent"
      ADD CONSTRAINT "UploadIntent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ── (tenantId, id) unique indexes ───────────────────────────────────────────
-- Required by the composite foreign keys in
-- prisma/sql/060_tenant_composite_fks.sql, which is why this file must be
-- applied before `pnpm db:bootstrap`.
--
-- A duplicate cannot exist: `id` is already the primary key of each table, so
-- these succeed on any consistent database.
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_tenantId_id_key"
  ON "Branch"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "AuditArea_tenantId_id_key"
  ON "AuditArea"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "AuditPlan_tenantId_id_key"
  ON "AuditPlan"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "AuditEngagement_tenantId_id_key"
  ON "AuditEngagement"("tenantId", "id");
