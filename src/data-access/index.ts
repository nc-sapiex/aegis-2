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
// - DAL functions accept session object for tenantId (never from request input)
// - Every query adds an explicit WHERE tenantId — this is the ONLY isolation
//   control. prismaForTenant() validates the UUID and returns the shared
//   client; no RLS policies are in effect. See src/data-access/README.md.
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
