-- Dashboard Aggregation Views and Functions
-- Phase 09-01: Dashboard Infrastructure
-- All views use tenantId for multi-tenant isolation
-- NOTE: Prisma uses PascalCase table names and camelCase column names

-- ─── 1. fn_extract_fiscal_year(DATE) ─────────────────────────────────────────
-- Indian FY: month >= April → current calendar year, else previous year.
-- Example: 2026-02-09 → 2025 (FY 2025-26), 2025-06-15 → 2025 (FY 2025-26)

CREATE OR REPLACE FUNCTION fn_extract_fiscal_year(d DATE)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d) >= 4 THEN EXTRACT(YEAR FROM d)::INTEGER
    ELSE (EXTRACT(YEAR FROM d) - 1)::INTEGER
  END;
$$;

-- ─── 2. v_compliance_summary ─────────────────────────────────────────────────
-- Per-tenant compliance status counts

CREATE OR REPLACE VIEW v_compliance_summary AS
SELECT
  "tenantId" AS tenant_id,
  COUNT(*)::BIGINT AS total,
  COUNT(*) FILTER (WHERE status = 'COMPLIANT')::BIGINT AS compliant,
  COUNT(*) FILTER (WHERE status = 'PARTIAL')::BIGINT AS partial,
  COUNT(*) FILTER (WHERE status = 'NON_COMPLIANT')::BIGINT AS non_compliant,
  COUNT(*) FILTER (WHERE status = 'PENDING')::BIGINT AS pending,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE status = 'COMPLIANT'))::NUMERIC / COUNT(*)::NUMERIC * 100,
      1
    )
    ELSE 0
  END AS compliance_percentage
FROM "ComplianceRequirement"
GROUP BY "tenantId";

-- ─── 3. v_observation_aging ──────────────────────────────────────────────────
-- Per-tenant observation aging buckets (based on dueDate vs current date)

CREATE OR REPLACE VIEW v_observation_aging AS
SELECT
  "tenantId" AS tenant_id,
  COUNT(*)::BIGINT AS total_open,
  COUNT(*) FILTER (
    WHERE "dueDate" IS NULL OR "dueDate" >= CURRENT_DATE
  )::BIGINT AS current_count,
  COUNT(*) FILTER (
    WHERE "dueDate" < CURRENT_DATE
      AND (CURRENT_DATE - "dueDate"::DATE) BETWEEN 0 AND 30
  )::BIGINT AS bucket_0_30,
  COUNT(*) FILTER (
    WHERE "dueDate" < CURRENT_DATE
      AND (CURRENT_DATE - "dueDate"::DATE) BETWEEN 31 AND 60
  )::BIGINT AS bucket_31_60,
  COUNT(*) FILTER (
    WHERE "dueDate" < CURRENT_DATE
      AND (CURRENT_DATE - "dueDate"::DATE) BETWEEN 61 AND 90
  )::BIGINT AS bucket_61_90,
  COUNT(*) FILTER (
    WHERE "dueDate" < CURRENT_DATE
      AND (CURRENT_DATE - "dueDate"::DATE) > 90
  )::BIGINT AS bucket_90_plus
FROM "Observation"
WHERE status != 'CLOSED'
GROUP BY "tenantId";

-- ─── 4. v_observation_severity ───────────────────────────────────────────────
-- Per-tenant severity distribution

CREATE OR REPLACE VIEW v_observation_severity AS
SELECT
  "tenantId" AS tenant_id,
  COUNT(*)::BIGINT AS total,
  COUNT(*) FILTER (WHERE status != 'CLOSED')::BIGINT AS total_open,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status != 'CLOSED')::BIGINT AS critical_open,
  COUNT(*) FILTER (WHERE severity = 'HIGH' AND status != 'CLOSED')::BIGINT AS high_open,
  COUNT(*) FILTER (WHERE severity = 'MEDIUM' AND status != 'CLOSED')::BIGINT AS medium_open,
  COUNT(*) FILTER (WHERE severity = 'LOW' AND status != 'CLOSED')::BIGINT AS low_open,
  COUNT(*) FILTER (WHERE status = 'CLOSED')::BIGINT AS closed
FROM "Observation"
GROUP BY "tenantId";

-- ─── 5. v_audit_coverage_branch ──────────────────────────────────────────────
-- Per-branch audit coverage for current fiscal year only

CREATE OR REPLACE VIEW v_audit_coverage_branch AS
SELECT
  b."tenantId" AS tenant_id,
  b.id AS branch_id,
  b.name AS branch_name,
  COALESCE(COUNT(ae.id) FILTER (WHERE ae.status = 'COMPLETED'), 0)::BIGINT AS completed_engagements,
  COALESCE(COUNT(ae.id), 0)::BIGINT AS total_engagements,
  COALESCE(COUNT(ae.id) FILTER (WHERE ae.status = 'COMPLETED'), 0) > 0 AS is_covered
FROM "Branch" b
LEFT JOIN "AuditEngagement" ae ON ae."branchId" = b.id
  AND ae."tenantId" = b."tenantId"
LEFT JOIN "AuditPlan" ap ON ae."auditPlanId" = ap.id
  AND ap."tenantId" = b."tenantId"
  AND ap.year = fn_extract_fiscal_year(CURRENT_DATE)
GROUP BY b."tenantId", b.id, b.name;

-- ─── 6. v_auditor_workload ───────────────────────────────────────────────────
-- Per-auditor observation counts

CREATE OR REPLACE VIEW v_auditor_workload AS
SELECT
  o."tenantId" AS tenant_id,
  o."assignedToId" AS assigned_to_id,
  u.name AS auditor_name,
  COUNT(*)::BIGINT AS total_assigned,
  COUNT(*) FILTER (WHERE o.status != 'CLOSED')::BIGINT AS open_count,
  COUNT(*) FILTER (
    WHERE o.status != 'CLOSED'
      AND o.severity IN ('CRITICAL', 'HIGH')
  )::BIGINT AS high_critical_open
FROM "Observation" o
JOIN "User" u ON u.id = o."assignedToId"
WHERE o."assignedToId" IS NOT NULL
GROUP BY o."tenantId", o."assignedToId", u.name;

-- ─── 7. fn_dashboard_health_score(UUID) ──────────────────────────────────────
-- Weighted health score: Compliance(40%) + FindingResolution(35%) + AuditCoverage(25%)
-- Returns 0-100 score rounded to 0 decimal places

CREATE OR REPLACE FUNCTION fn_dashboard_health_score(p_tenant_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_compliance_score NUMERIC := 0;
  v_finding_score NUMERIC := 100;
  v_coverage_score NUMERIC := 0;
  v_penalty NUMERIC := 0;
  v_covered BIGINT := 0;
  v_total_branches BIGINT := 0;
BEGIN
  -- Component 1: Compliance Score (40%)
  SELECT COALESCE(compliance_percentage, 0)
  INTO v_compliance_score
  FROM v_compliance_summary
  WHERE tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    v_compliance_score := 0;
  END IF;

  -- Component 2: Finding Resolution Score (35%)
  -- 100 minus severity penalties, capped at 0
  SELECT
    COALESCE(critical_open, 0) * 15
    + COALESCE(high_open, 0) * 8
    + COALESCE(medium_open, 0) * 3
    + COALESCE(low_open, 0) * 1
  INTO v_penalty
  FROM v_observation_severity
  WHERE tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    v_penalty := 0;
  END IF;

  v_finding_score := GREATEST(0, 100 - v_penalty);

  -- Component 3: Audit Coverage Score (25%)
  SELECT
    COUNT(*) FILTER (WHERE is_covered),
    COUNT(*)
  INTO v_covered, v_total_branches
  FROM v_audit_coverage_branch
  WHERE tenant_id = p_tenant_id;

  IF v_total_branches > 0 THEN
    v_coverage_score := ROUND(v_covered::NUMERIC / v_total_branches::NUMERIC * 100, 1);
  END IF;

  -- Weighted formula
  RETURN ROUND(
    v_compliance_score * 0.40
    + v_finding_score * 0.35
    + v_coverage_score * 0.25,
    0
  );
END;
$$;
