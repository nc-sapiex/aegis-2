"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { SaveCriteriaSchema, type SaveCriteriaInput } from "./schemas";

/**
 * Save (create or update) sampling criteria for a given engagement + module.
 *
 * Security:
 * - Requires "audit_execution:manage_sections" permission (HIA / CAE role)
 * - Rejects modification if sample has already been generated (sampleGenerated = true)
 *
 * Creates SamplingConfig if it doesn't exist, or updates sampleSizePct +
 * criteriaBuckets if it does and the sample hasn't been generated yet.
 *
 * SMPL-01: HIA can define criteria buckets with % allocations
 * SMPL-02: HIA can set overall sample size as a percentage
 */
export async function saveSamplingCriteria(input: SaveCriteriaInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
    return {
      success: false as const,
      error: "You do not have permission to configure sampling criteria.",
    };
  }

  const parsed = SaveCriteriaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { engagementId, moduleCode, sampleSizePct, criteriaBuckets } =
    parsed.data;

  const db = prismaForTenant(tenantId);

  try {
    // Check if an existing config has already generated a sample (locked)
    const existing = await db.samplingConfig.findFirst({
      where: { engagementId, moduleCode, tenantId },
      select: { id: true, sampleGenerated: true, isLocked: true },
    });

    if (existing?.sampleGenerated) {
      return {
        success: false as const,
        error:
          "Cannot modify criteria after sample has been generated. Unlock first.",
      };
    }

    // Upsert the SamplingConfig — create if missing, update criteria if found
    const config = await db.samplingConfig.upsert({
      where: {
        engagementId_moduleCode: { engagementId, moduleCode },
      },
      create: {
        tenantId,
        engagementId,
        moduleCode,
        sampleSizePct,
        criteriaBuckets,
        createdById: session.user.id,
      },
      update: {
        sampleSizePct,
        criteriaBuckets,
        // Only reset lock state when updating criteria (lock was NOT from sample generation,
        // so this path is only reachable when sampleGenerated = false)
        isLocked: false,
        lockedAt: null,
        lockedById: null,
      },
    });

    revalidatePath(`/audit-execution/${engagementId}/rbia/sampling`);

    logger.info(
      {
        action: "save_sampling_criteria",
        engagementId,
        moduleCode,
        configId: config.id,
        userId: session.user.id,
        tenantId,
      },
      "Sampling criteria saved",
    );

    return { success: true as const, data: config };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save sampling criteria.";
    logger.error(
      { error, action: "save_sampling_criteria", engagementId, tenantId },
      message,
    );
    return { success: false as const, error: message };
  }
}
