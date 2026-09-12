"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  computeRam,
  computeRamWithUplift,
  computeCompositeScore,
  type RamScoreInput,
} from "@/lib/ram-engine";
import {
  detectRepeatFindingsForBranch,
  computeRepeatUplift,
} from "@/lib/repeat-finding-detector";
import { AssessmentIdSchema } from "./schemas";

/**
 * Compute composite score for a RAM assessment.
 * Reads all saved scores, runs computation engine, updates assessment + branch.
 * Security: Requires ram:create permission.
 * Side effects: Updates Branch.ramScore and Branch.auditFrequency.
 */
export async function computeRamAssessment(input: { assessmentId: string }) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "ram:create")) {
    return {
      success: false as const,
      error: "You do not have permission to compute RAM assessments.",
    };
  }

  const parsed = AssessmentIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const result = await withAuditedMutation(
      userActor(session),
      "ram_assessment.computed",
      async (tx) => {
        // Load assessment with scores and param configs
        const assessment = await tx.ramAssessment.findFirst({
          where: { id: parsed.data.assessmentId, tenantId },
          include: {
            scores: {
              include: {
                paramConfig: { select: { code: true, weight: true } },
              },
            },
          },
        });

        if (!assessment) {
          throw new Error("Assessment not found");
        }
        if (assessment.status === "APPROVED") {
          throw new Error("Cannot re-compute an approved assessment");
        }
        if (assessment.scores.length === 0) {
          throw new Error(
            "No scores entered. Please score all parameters before computing.",
          );
        }

        // Prepare score inputs for engine
        const scoreInputs: RamScoreInput[] = assessment.scores.map(
          (s: any) => ({
            paramCode: s.paramConfig.code,
            score: Number(s.score),
            weight: Number(s.paramConfig.weight),
          }),
        );

        // Step: Detect repeat findings for this branch
        const repeatSummary = await detectRepeatFindingsForBranch(
          tenantId,
          assessment.branchId,
          undefined, // No current engagement filter — check all recent audits
        );

        // Step: Compute uplift
        const rawComposite = computeCompositeScore(scoreInputs);
        const uplift = computeRepeatUplift(rawComposite, repeatSummary);

        // Step: Full computation with uplift
        const result = computeRamWithUplift(scoreInputs, uplift);
        const { compositeScore, riskCategory, auditFrequency } = result;

        // Update assessment
        const updated = await tx.ramAssessment.update({
          where: { id: assessment.id },
          data: {
            compositeScore,
            riskCategory,
            auditFrequency,
            rawCompositeScore: result.rawCompositeScore,
            repeatUpliftApplied: result.repeatUpliftApplied,
            repeatFindingCount: result.repeatFindingCount,
            status: "COMPUTED",
            computedById: session.user.id,
            computedAt: new Date(),
          },
        });

        // Update branch cached fields
        await tx.branch.update({
          where: { id: assessment.branchId },
          data: {
            ramScore: compositeScore,
            auditFrequency,
          },
        });

        return {
          assessment: updated,
          upliftData: {
            upliftApplied: uplift.upliftApplied,
            repeatCount: uplift.repeatCount,
            rawComposite,
          },
        };
      },
    );

    revalidatePath("/ram");
    return {
      success: true as const,
      data: {
        id: result.assessment.id,
        compositeScore: Number(result.assessment.compositeScore),
        riskCategory: result.assessment.riskCategory,
        auditFrequency: result.assessment.auditFrequency,
        repeatUpliftApplied: result.upliftData.upliftApplied,
        repeatFindingCount: result.upliftData.repeatCount,
        rawCompositeScore: result.upliftData.rawComposite,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to compute RAM assessment.";
    logger.error(
      { error, action: "compute_ram_assessment", tenantId },
      message,
    );
    return { success: false as const, error: message };
  }
}
