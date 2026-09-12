"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";

/**
 * Zod validation schema for editable settings.
 *
 * READ-ONLY fields NOT included (DE11):
 * - name (legal bank name) — set during onboarding, cannot be updated
 * - rbiLicenseNo (RBI License Number) — set during onboarding, cannot be updated
 * - state (state of registration) — set during onboarding, cannot be updated
 * - tier (UCB Tier) — set during onboarding, cannot be updated
 * - incorporationDate — set during onboarding, cannot be updated
 * - Fiscal Year — hardcoded April-March (DE7), not configurable
 *
 * EDITABLE fields:
 * - shortName, address, city, pincode, phone, email, website
 */
const settingsSchema = z.object({
  shortName: z.string().min(1).max(50).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().min(1).max(100).optional(),
  pincode: z.string().max(6).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

/**
 * Update editable tenant settings.
 *
 * Security:
 * - Permission check: admin:manage_settings
 * - tenantId from session only (S2)
 * - Zod validation rejects read-only fields
 * - Audit context set for tracking
 */
export async function updateTenantSettings(formData: SettingsInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  // Permission check
  if (!hasPermission(userRoles, "admin:manage_settings")) {
    return {
      success: false,
      error: "You do not have permission to update settings.",
    };
  }

  // Validate input
  const result = settingsSchema.safeParse(formData);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  const validated = result.data;
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    await db.$transaction(async (tx: any) => {
      // Set audit context for tracking
      await setAuditContext(tx, {
        actionType: "tenant.settings_updated",
        userId: session.user.id,
        tenantId: tenantId,
        ipAddress: (await headers()).get("x-forwarded-for") ?? "unknown",
        sessionId: session.session.id,
      });

      // Update with explicit WHERE tenantId
      await tx.tenant.update({
        where: { id: tenantId },
        data: validated,
      });
    });

    revalidatePath("/settings");
    return { success: true, error: null };
  } catch (error) {
    logger.error(
      { error, action: "update_tenant_settings", tenantId },
      "Failed to update tenant settings",
    );
    return {
      success: false,
      error: "Failed to update settings. Please try again.",
    };
  }
}
