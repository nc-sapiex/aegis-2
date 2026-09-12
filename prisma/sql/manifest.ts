/**
 * Database objects that live outside Prisma's schema, in apply order.
 *
 * `prisma db push` creates tables and indexes from schema.prisma and nothing
 * else. Triggers, views, functions, CHECK constraints and composite foreign
 * keys come from here. `pnpm db:bootstrap` applies them; `pnpm db:verify`
 * asserts they landed.
 *
 * Order matters: the audit trigger function must exist before any trigger
 * references it.
 */
export const SQL_MANIFEST = [
  "prisma/migrations/20260826_audit_trigger_null_safe.sql",
  "prisma/sql/020_attach_audit_triggers.sql",
  "prisma/migrations/20260209_dashboard_views.sql",
  "prisma/migrations/20260222_rbia_db_guards.sql",
  "prisma/sql/050_observation_indexes.sql",
  "prisma/sql/060_tenant_composite_fks.sql",
] as const;

/**
 * Tables carrying `audit_trigger`. Must equal `AUDITED_TABLES` in
 * `src/lib/audit-triggers.ts` and the array in `020_attach_audit_triggers.sql`:
 * the discipline test reads the first, `db:bootstrap` applies the second, and
 * `db:verify` checks this one. A table missing from any of the three is a table
 * whose unattributed writes pass CI and fail in production.
 */
const AUDIT_TRIGGER_TABLES = [
  "Tenant",
  "User",
  "Branch",
  "AuditArea",
  "AuditPlan",
  "AuditEngagement",
  "Observation",
  "ObservationTimeline",
  "Evidence",
  "ComplianceRequirement",
  "UserBranchAssignment",
  "AuditeeResponse",
  "NotificationQueue",
  "EmailLog",
  "NotificationPreference",
  "BoardReport",
  // RBIA/GRC scoring surface — the regulated change-history. Every write path
  // already sets session context, so the trigger fires cleanly.
  "ActionPoint",
  "RamAssessment",
  "RamAssessmentScore",
  "BranchRbiaScore",
  "AuditExaminationResponse",
  // Remaining scoring tables; their write paths now set session context.
  "ExaminationResponse",
  "AccountExamResponse",
  "LoanAccount",
] as const;

export interface RequiredObjects {
  functions: readonly string[];
  views: readonly string[];
  triggers: readonly string[];
  constraints: readonly string[];
}

export const REQUIRED_OBJECTS: RequiredObjects = {
  functions: [
    "audit_trigger_function",
    "prevent_frozen_score_update",
    "fn_extract_fiscal_year",
    "fn_dashboard_health_score",
  ],
  views: [
    "v_compliance_summary",
    "v_observation_aging",
    "v_observation_severity",
    "v_audit_coverage_branch",
    "v_auditor_workload",
  ],
  triggers: AUDIT_TRIGGER_TABLES,
  constraints: [
    "examination_node_path_ends_with_code",
    "engagement_plan_same_tenant",
    "engagement_branch_same_tenant",
    "engagement_area_same_tenant",
    "team_member_engagement_same_tenant",
  ],
};
