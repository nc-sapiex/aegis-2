"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { SaveRamScoresSchema, type SaveRamScoresInput } from "./schemas";

/**
 * Save/update individual parameter scores for a RAM assessment.
 * Security: Requires ram:create permission.
 * Atomicity: Upserts all scores in a single transaction.
 */
export async function saveRamScores(input: SaveRamScoresInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "ram:create")) {
    return {
      success: false as const,
      error: "You do not have permission to score RAM assessments.",
    };
  }

  const parsed = SaveRamScoresSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const validated = parsed.data;

  try {
    await withAuditedMutation(
      userActor(session),
      "ram_assessment.scores_saved",
      async (tx) => {
        // Verify assessment exists, belongs to tenant, and is in DRAFT status
        const assessment = await tx.ramAssessment.findFirst({
          where: { id: validated.assessmentId, tenantId },
        });
        if (!assessment) {
          throw new Error("Assessment not found");
        }
        if (assessment.status !== "DRAFT") {
          throw new Error("Can only save scores for DRAFT assessments");
        }

        // Upsert each score
        for (const scoreInput of validated.scores) {
          await tx.ramAssessmentScore.upsert({
            where: {
              assessmentId_paramConfigId: {
                assessmentId: validated.assessmentId,
                paramConfigId: scoreInput.paramConfigId,
              },
            },
            update: {
              score: scoreInput.score,
              remarks: scoreInput.remarks ?? null,
            },
            create: {
              assessmentId: validated.assessmentId,
              paramConfigId: scoreInput.paramConfigId,
              score: scoreInput.score,
              remarks: scoreInput.remarks ?? null,
            },
          });
        }
      },
    );

    revalidatePath("/ram");
    return {
      success: true as const,
      data: { assessmentId: validated.assessmentId },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save RAM scores.";
    logger.error({ error, action: "save_ram_scores", tenantId }, message);
    return { success: false as const, error: message };
  }
}
