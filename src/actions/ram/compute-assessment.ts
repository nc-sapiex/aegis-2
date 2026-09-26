"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  areAllActiveParametersScored,
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
 * Reads saved scores, runs the computation engine, updates the assessment.
 * Security: Requires ram:create permission.
 * Does not publish Branch.ramScore — that happens on CAE approval, which
 * is the gate the RAM page labels "Ready for Audit Planning".
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

        const activeParams = await tx.ramParameterConfig.findMany({
          where: { tenantId, isActive: true },
          select: { id: true },
        });
        const activeParamIds = activeParams.map((p) => p.id);
        const scoredParamIds = assessment.scores.map(
          (s: { paramConfigId: string }) => s.paramConfigId,
        );
        if (!areAllActiveParametersScored(activeParamIds, scoredParamIds)) {
          throw new Error("Please score all parameters before computing.");
        }

        const activeIdSet = new Set(activeParamIds);
        // Prepare score inputs for engine — ignore deactivated params
        const scoreInputs: RamScoreInput[] = assessment.scores
          .filter((s: { paramConfigId: string }) =>
            activeIdSet.has(s.paramConfigId),
          )
          .map((s: any) => ({
            paramCode: s.paramConfig.code,
            score: Number(s.score),
            weight: Number(s.paramConfig.weight),
          }));

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

        // Update assessment only. Branch.ramScore / auditFrequency stay
        // on the last APPROVED assessment until CAE signs this one off.
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
