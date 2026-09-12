"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";

/**
 * Schema for branch profile update (R2/R3).
 * Captures zone, category, business size, and staff strength
 * beyond basic branch info (code, name, city).
 */
const UpdateBranchProfileSchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
  zoneId: z.string().uuid("Invalid zone ID").nullable().optional(),
  category: z
    .enum(["LARGE", "MEDIUM", "SMALL", "VERY_SMALL"])
    .nullable()
    .optional(),
  businessSize: z.number().min(0).nullable().optional(),
  staffStrength: z.number().int().min(0).nullable().optional(),
});

export type UpdateBranchProfileInput = z.infer<
  typeof UpdateBranchProfileSchema
>;

/**
 * Update branch profile with R3 metadata fields.
 * Security: Requires admin:system permission.
 * Tenant isolation: prismaForTenant + ownership check.
 */
export async function updateBranchProfile(input: UpdateBranchProfileInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "admin:system")) {
    return { success: false as const, error: "Permission denied." };
  }

  const parsed = UpdateBranchProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const db = prismaForTenant(tenantId);

  try {
    // Verify branch belongs to tenant
    const branch = await db.branch.findFirst({
      where: { id: parsed.data.branchId, tenantId },
      select: { id: true },
    });

    if (!branch) {
      return { success: false as const, error: "Branch not found." };
    }

    await withAuditedMutation(userActor(session), "branch.updated", (tx) =>
      tx.branch.update({
        where: { id: parsed.data.branchId },
        data: {
          ...(parsed.data.zoneId !== undefined && {
            zoneId: parsed.data.zoneId,
          }),
          ...(parsed.data.category !== undefined && {
            category: parsed.data.category,
          }),
          ...(parsed.data.businessSize !== undefined && {
            businessSize: parsed.data.businessSize,
          }),
          ...(parsed.data.staffStrength !== undefined && {
            staffStrength: parsed.data.staffStrength,
          }),
        },
      }),
    );

    revalidatePath("/admin/branches");
    revalidatePath("/risk-management");
    revalidatePath("/ram");

    return { success: true as const, data: null };
  } catch (error) {
    logger.error(
      { error, branchId: parsed.data.branchId },
      "Failed to update branch profile",
    );
    return {
      success: false as const,
      error: "Failed to update branch profile.",
    };
  }
}
