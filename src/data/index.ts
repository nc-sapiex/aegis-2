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

// DEPRECATED: Demo/seed data — prototype views only
// TODO: Remove these exports when all pages use database queries
export { default as bankProfile } from "./seed/bank-profile.json";
export { default as staff } from "./seed/staff.json";
export { default as branches } from "./seed/branches.json";
export { default as demoComplianceRequirements } from "./seed/compliance-requirements.json";
export { default as auditPlans } from "./seed/audit-plans.json";
export { default as findings } from "./seed/findings.json";
export { default as rbiCirculars } from "./seed/rbi-circulars.json";
