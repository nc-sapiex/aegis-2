// ============================================================================
// Data Access Layer (DAL) Barrel Export
// ============================================================================
// All DAL modules are exported here. Import from this file:
//
// import { getTenantSettings } from "@/data-access";
//
// SECURITY NOTES:
// - All DAL modules are server-only (import "server-only" at file top;
//   enforced by __tests__/tenant-isolation.test.ts)
// - DAL functions take tenantId from the session, never from request input
// - Every query adds an explicit WHERE tenantId. That is wall 1.
//   prismaForTenant() also sets app.current_tenant_id so PostgreSQL RLS
//   (prisma/sql/070_rls_policies.sql, FORCE ROW LEVEL SECURITY on aegis_app)
//   can enforce wall 2. RLS is not a reason to drop the predicate.
//   See src/data-access/README.md and docs/adr/0001-rls-enforcement.md.
// ============================================================================

import "server-only";

// Settings module (canonical example for all DAL modules)
export { getTenantSettings, updateTenantSettingsDAL } from "./settings";
export type { TenantSettings } from "@/types";

// Session module (tenantId source of truth)
export { getRequiredSession, getOptionalSession } from "./session";

// Prisma module (tenant-scoped client with RLS)
export { prismaForTenant } from "@/lib/prisma";

// Users module (05-04)
export { getUsers, getUserById } from "./users";

// Future exports: observations, compliance, audit-plans, evidence, etc.
