"use server";

import { z } from "zod";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ScoreLabel } from "@/generated/prisma/enums";

const ScoreStatementSchema = z.object({
  engagementId: z.string().uuid(),
  nodeId: z.string().uuid(),
  scoreLabel: z.enum([
    "FULLY_COMPLIANT",
    "LARGELY_COMPLIANT",
    "PARTIALLY_COMPLIANT",
    "MARGINALLY_COMPLIANT",
    "NON_COMPLIANT",
  ]),
  remarks: z.string().max(2000).nullable(),
  expectedVersion: z.number().int().positive(),
});

export type ScoreStatementInput = z.infer<typeof ScoreStatementSchema>;

/**
 * Compare-and-set save (D8): the client sends the version it last read; a
 * stale version means someone else scored the row since, so the caller gets
 * a conflict and must reload before retrying.
 */
export async function scoreStatement(input: ScoreStatementInput) {
  const session = await getRequiredSession();

  if (!hasPermission(session.user.roles, "rbia:examine")) {
    return {
      success: false as const,
      error: "You do not have permission to score this statement.",
    };
  }

  const parsed = ScoreStatementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { engagementId, nodeId, scoreLabel, remarks, expectedVersion } =
    parsed.data;
  const tenantId = session.user.tenantId;

  try {
    const version = await withAuditedMutation(
      userActor(session),
      "rbia.statement_scored",
      async (tx) => {
        // No DB trigger guards ExaminationResponse the way
        // prevent_frozen_score_update guards BranchRbiaScore — only that
        // table's own row is immutable after freeze. Check here so a plain
        // rbia:examine caller can't edit a frozen engagement's responses;
        // that path is rbia:revise_score (revise-score.ts) by design.
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: engagementId, tenantId },
          select: { branchRbiaScore: { select: { frozenAt: true } } },
        });
        if (engagement?.branchRbiaScore?.frozenAt) {
          throw new Error("SCORE_FROZEN");
        }

        const result = await tx.examinationResponse.updateMany({
          where: { tenantId, engagementId, nodeId, version: expectedVersion },
          data: {
            score: SCORE_VALUES[scoreLabel as ScoreLabel],
            scoreLabel: scoreLabel as ScoreLabel,
            isNotApplicable: false,
            notApplicableReason: null,
            remarks,
            respondedById: session.user.id,
            respondedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new Error("VERSION_CONFLICT");
        }
        const updated = await tx.examinationResponse.findUniqueOrThrow({
          where: { engagementId_nodeId: { engagementId, nodeId } },
          select: { version: true },
        });
        return updated.version;
      },
    );
    return { success: true as const, data: { version } };
  } catch (err) {
    if (err instanceof Error && err.message === "VERSION_CONFLICT") {
      return {
        success: false as const,
        error: "Someone else scored this statement. Reload to see the latest.",
        conflict: true as const,
      };
    }
    if (err instanceof Error && err.message === "SCORE_FROZEN") {
      return {
        success: false as const,
        error: "This engagement's score is frozen. Use score revision instead.",
      };
    }
    throw err;
  }
}
