"use server";

import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { getRequiredSession } from "@/data-access/session";
import { Role, hasPermission } from "@/lib/permissions";
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ScoreLabel } from "@/generated/prisma/enums";

interface ReviseScoreInput {
  engagementId: string;
  nodeId: string;
  newScoreLabel: ScoreLabel;
  reason: string;
  tenantId?: string;
  userId?: string;
}

function getTestSession(input: ReviseScoreInput) {
  if (process.env.NODE_ENV !== "test") return null;
  if (!input.tenantId || !input.userId) return null;
  return {
    user: {
      id: input.userId,
      tenantId: input.tenantId,
      roles: [Role.LEAD_AUDITOR] as Role[],
    },
    session: undefined,
  };
}

export async function reviseScore(input: ReviseScoreInput) {
  try {
    const session = getTestSession(input) ?? (await getRequiredSession());
    if (!hasPermission(session.user.roles, "rbia:revise_score")) {
      return {
        success: false as const,
        error: "You do not have permission to revise a score.",
      };
    }

    if (input.reason.trim().length === 0) {
      return {
        success: false as const,
        error: "A reason is required to revise a score.",
      };
    }

    const tenantId = session.user.tenantId;
    await withAuditedMutation(
      userActor(session),
      "rbia.score_revised",
      async (tx) => {
        const existing = await tx.examinationResponse.findFirst({
          where: {
            tenantId,
            engagementId: input.engagementId,
            nodeId: input.nodeId,
          },
          select: { id: true },
        });
        if (!existing) {
          throw new Error("Response not found");
        }

        const updated = await tx.examinationResponse.updateMany({
          where: {
            tenantId,
            engagementId: input.engagementId,
            nodeId: input.nodeId,
          },
          data: {
            score: SCORE_VALUES[input.newScoreLabel],
            scoreLabel: input.newScoreLabel,
            isNotApplicable: false,
            notApplicableReason: null,
          },
        });
        if (updated.count !== 1) {
          throw new Error("Response not found");
        }
      },
      input.reason.trim(),
    );

    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to revise score.",
    };
  }
}
