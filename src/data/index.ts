// ============================================================================
// AEGIS Platform - Data Exports
// ============================================================================
// RBI Regulations data for runtime use.
// Demo/seed data exports below are DEPRECATED — prototype views still depend
// on them. Migrate to database-backed queries in a future phase.
// ============================================================================

// RBI Regulations Data (production)
export { regulations } from "./rbi-regulations/index";
export { chapters } from "./rbi-regulations/chapters";
export { definitions } from "./rbi-regulations/definitions";
export { capitalStructure } from "./rbi-regulations/capital-structure";
export { complianceRequirements } from "./rbi-regulations/compliance-requirements";

// DEPRECATED: Demo/seed data — still consumed by src/lib/report-utils.ts and
// several src/components/dashboard/* widgets. Migrate to database-backed
// queries in a future phase; do not delete until those callers are moved off.
// TODO: Remove these exports when all pages use database queries
export { default as bankProfile } from "./seed/bank-profile.json";
export { default as demoComplianceRequirements } from "./seed/compliance-requirements.json";
export { default as auditPlans } from "./seed/audit-plans.json";
export { default as findings } from "./seed/findings.json";
