import "server-only";
import { getRequiredSession } from "./session";
import { prismaForTenant } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantSettings } from "@/types";
import { withAuditedMutation, userActor } from "./audited-mutation";

/**
 * DATA ACCESS LAYER PATTERN (canonical example for all DAL modules):
 *
 * 1. Import 'server-only' — prevents client-side import
 * 2. Call getRequiredSession() — single source of tenantId (Skeptic S2)
 * 3. Use prismaForTenant(tenantId) — RLS isolation
 * 4. Add explicit WHERE tenantId — belt-and-suspenders (Skeptic S1)
 * 5. Runtime assertion — verify returned data matches tenantId
 *
 * SECURITY INVARIANTS:
 * - tenantId MUST come from session ONLY, never from URL/body/query
 * - NEVER use $queryRaw/$executeRaw without explicit tenantId parameter
 * - Every function follows this exact 5-step pattern
 */

export type { TenantSettings };

/**
 * Get tenant settings (bank profile) from PostgreSQL.
 *
 * Steps:
 * 1. getRequiredSession() — tenantId from session only
 * 2. prismaForTenant() — RLS isolation
 * 3. Explicit WHERE tenantId — belt-and-suspenders
 * 4. Runtime assertion — verify data matches
 */
export async function getTenantSettings(): Promise<TenantSettings | null> {
  // Step 1: Get authenticated session (tenantId source)
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  // Step 2: Get tenant-scoped Prisma client (RLS layer)
  const db = prismaForTenant(tenantId);

  // Step 3: Query with EXPLICIT WHERE tenantId (belt-and-suspenders)
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      shortName: true,
      rbiLicenseNo: true,
      tier: true,
      state: true,
      city: true,
      address: true,
      pincode: true,
      phone: true,
      email: true,
      website: true,
      incorporationDate: true,
      scheduledBankStatus: true,
      multiStateLicense: true,
      pcaStatus: true,
      pcaEffectiveDate: true,
      lastRbiInspectionDate: true,
      rbiRiskRating: true,
      settings: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Step 4: Runtime assertion (Skeptic S1)
  if (tenant && tenant.id !== tenantId) {
    console.error("CRITICAL: Tenant ID mismatch in getTenantSettings", {
      expected: tenantId,
      received: tenant.id,
    });
    throw new Error("Data isolation violation detected");
  }

  return tenant as TenantSettings | null;
}

/**
 * Update editable tenant settings.
 *
 * READ-ONLY fields NOT updatable (DE11):
 * - name (legal bank name), rbiLicenseNo, state, tier
 *
 * EDITABLE fields: shortName, city
 *
 * @param data - Validated editable fields only
 */
export async function updateTenantSettingsDAL(
  data: Pick<Prisma.TenantUpdateInput, "shortName" | "city" | "settings">,
) {
  // Step 1: Get authenticated session
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  // Step 2: Get tenant-scoped Prisma client
  const db = prismaForTenant(tenantId);

  // Step 3: Update with explicit WHERE tenantId, inside a session context so
  // the audit trigger can attribute the change.
  const updated = await withAuditedMutation(
    userActor(session),
    "tenant.settings_updated",
    (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data,
      }),
  );

  // Step 4: Runtime assertion
  if (updated.id !== tenantId) {
    console.error("CRITICAL: Tenant ID mismatch in updateTenantSettings", {
      expected: tenantId,
      received: updated.id,
    });
    throw new Error("Data isolation violation detected");
  }

  return updated;
}
