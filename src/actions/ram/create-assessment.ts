"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  CreateRamAssessmentSchema,
  type CreateRamAssessmentInput,
} from "./schemas";

/**
 * Create a new RAM assessment for a branch/year.
 * Security: Requires ram:create permission.
 * Atomicity: Creates assessment record in transaction.
 */
export async function createRamAssessment(input: CreateRamAssessmentInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "ram:create")) {
    return {
      success: false as const,
      error: "You do not have permission to create RAM assessments.",
    };
  }

  const parsed = CreateRamAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const validated = parsed.data;

  try {
    const result = await withAuditedMutation(
      userActor(session),
      "ram_assessment.created",
      async (tx) => {
        // Check branch exists and belongs to tenant
        const branch = await tx.branch.findFirst({
          where: { id: validated.branchId, tenantId },
        });
        if (!branch) {
          throw new Error("Branch not found");
        }

        // Check for existing assessment for same branch/year
        const existing = await tx.ramAssessment.findFirst({
          where: {
            tenantId,
            branchId: validated.branchId,
            assessmentYear: validated.assessmentYear,
          },
        });
        if (existing) {
          throw new Error(
            `Assessment already exists for ${branch.name} in ${validated.assessmentYear}`,
          );
        }

        return tx.ramAssessment.create({
          data: {
            tenantId,
            branchId: validated.branchId,
            assessmentYear: validated.assessmentYear,
            status: "DRAFT",
          },
        });
      },
    );

    revalidatePath("/ram");
    return { success: true as const, data: { id: result.id } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create RAM assessment.";
    logger.error({ error, action: "create_ram_assessment", tenantId }, message);
    return { success: false as const, error: message };
  }
}
