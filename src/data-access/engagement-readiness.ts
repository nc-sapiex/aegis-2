import "server-only";
import { prismaForTenant } from "@/lib/prisma";
import { deriveStatementState } from "@/lib/statement-state";

/**
 * A statement with no ExaminationResponse row yet (never touched — Task 6/13:
 * response rows are created lazily, not at materialization time) must count
 * as unscored here. Reading ExaminationResponse alone, as the naive version
 * of this query would, silently drops untouched statements from every count
 * and makes fieldworkComplete vacuously true for an engagement nobody has
 * opened — EngagementStatement is the authoritative "what must be examined"
 * set, matching freeze.ts's own completeness gate.
 */
export async function getEngagementReadiness(
  tenantId: string,
  engagementId: string,
) {
  const db = prismaForTenant(tenantId);
  const [statements, responses, draftActionPoints] = await Promise.all([
    db.engagementStatement.findMany({
      where: { tenantId, engagementId, nodeId: { not: null } },
      select: { nodeId: true },
    }),
    db.examinationResponse.findMany({
      where: { tenantId, engagementId },
      select: {
        nodeId: true,
        scoreLabel: true,
        remarks: true,
        isNotApplicable: true,
      },
    }),
    db.actionPoint.count({
      where: { tenantId, engagementId, status: "DRAFT" },
    }),
  ]);

  const responseByNode = new Map(responses.map((r) => [r.nodeId, r]));

  let needsRemarks = 0;
  let notSaved = 0;
  let allExamined = true;
  for (const statement of statements) {
    const response = responseByNode.get(statement.nodeId!);
    const state = deriveStatementState({
      scoreLabel: response?.scoreLabel ?? null,
      remarks: response?.remarks ?? null,
      isNotApplicable: response?.isNotApplicable ?? false,
      saveFailed: false, // save-failure is client-side transient state, never persisted
    });
    if (state === "remarks_due") needsRemarks++;
    if (state === "not_saved") notSaved++;
    if (response?.scoreLabel == null && !response?.isNotApplicable) {
      allExamined = false;
    }
  }

  const fieldworkComplete = needsRemarks === 0 && notSaved === 0 && allExamined;

  return {
    sectionsComplete: fieldworkComplete,
    needsRemarks,
    notSaved,
    draftActionPoints,
    fieldworkComplete,
  };
}
