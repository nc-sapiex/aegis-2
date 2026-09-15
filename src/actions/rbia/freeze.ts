"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  computeModuleScore,
  computeCompositeScore,
  getRatingBand,
  SCORE_VALUES,
  type ScoredNode,
} from "@/lib/rbia-scoring-engine";
import {
  findUnscoredLeaves,
  engagementLeafInScope,
  type LeafStatus,
} from "@/lib/rbia-completeness";
import {
  FreezeRbiaScoreSchema,
  type FreezeRbiaScoreInput,
  type ActionResult,
  type ActionErrorCode,
} from "./schemas";
import { syncAllInstanceScores } from "@/data-access/instance-scoring";

// ─── freezeRbiaScore (EXAM-10, FIND-02, BMRP-01) ───────────────────────────

/**
 * Freeze the RBIA score for an engagement — the culminating action of the RBIA
 * audit workflow. Orchestrates 6 sequential steps inside a single Prisma
 * $transaction:
 *
 *   Step 0: Load engagement + validate state
 *   Step 1: Load all ExaminationResponses
 *   Step 2: Build scored examination tree
 *   Step 3: Compute per-module scores, composite score, and rating band
 *   Step 4: Upsert BranchRbiaScore snapshot (immutable after freeze)
 *   Step 5: Issue all DRAFT ActionPoints (DRAFT -> ISSUED)
 *   Step 6: Upsert BmResponseBatch with 15-day deadline
 *
 * Security:
 * - Permission: rbia:score_freeze (CAE + AUDIT_MANAGER only)
 * - tenantId from session only
 * - Engagement ownership validated via tenantId WHERE clause
 *
 * Idempotency:
 * - Pre-check for frozenAt gives user-friendly error before DB trigger fires
 * - BmResponseBatch uses upsert for safe retry
 *
 * Error reporting:
 * - Step-specific error messages via currentStep tracking
 * - SCORE_FROZEN code when score already frozen (DB trigger + pre-check)
 *
 * @returns compositeScore, ratingBand, apCount on success
 */
export async function freezeRbiaScore(
  input: FreezeRbiaScoreInput,
): Promise<
  ActionResult<{ compositeScore: number; ratingBand: string; apCount: number }>
> {
  // 1. Auth
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // 2. Permission
  if (!hasPermission(userRoles, "rbia:score_freeze")) {
    return {
      success: false,
      error: "You do not have permission to freeze RBIA scores.",
      code: "PERMISSION_DENIED",
    };
  }

  // 3. Validate
  const parsed = FreezeRbiaScoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }

  const validated = parsed.data;

  // 4. Pre-transaction: sync instance-based scores for credit modules
  //
  // This ensures ExaminationResponse records reflect the latest compliance data
  // BEFORE the transaction reads them to build the scoring tree snapshot.
  // syncAllInstanceScores computes compliance % from AccountExamResponse data
  // and upserts ExaminationResponse records on credit module leaf nodes.
  //
  // Must run OUTSIDE the transaction because it uses the same underlying
  // prisma singleton client — running inside $transaction would create a
  // nested transaction conflict.
  let currentStep = "syncing_instance_scores";

  try {
    await syncAllInstanceScores(session, validated.engagementId);

    // 5. Transaction with step tracking
    const result = await withAuditedMutation(
      userActor(session),
      "rbia_score.frozen",
      async (tx) => {
        // Reset step tracker for transaction steps
        currentStep = "loading_engagement";

        // ── Step 0: Load engagement + validate state ──
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: validated.engagementId, tenantId },
          select: {
            id: true,
            status: true,
            branchId: true,
            teamMembers: { select: { id: true } },
            meetings: { select: { meetingType: true, signedOff: true } },
            branchRbiaScore: { select: { id: true, frozenAt: true } },
          },
        });
        if (!engagement) throw new Error("Engagement not found");
        if (!engagement.branchId)
          throw new Error("Engagement has no branch assigned");

        // Check if already frozen — DB trigger will catch this too, but we can give a better error
        if (engagement.branchRbiaScore?.frozenAt) {
          throw Object.assign(
            new Error("Score has already been frozen for this engagement"),
            { code: "SCORE_FROZEN" },
          );
        }

        // ── Step 1: Load all ExaminationResponses for this engagement ──
        currentStep = "loading_responses";
        const responses = await tx.examinationResponse.findMany({
          where: { engagementId: validated.engagementId, tenantId },
          select: {
            id: true,
            nodeId: true,
            score: true,
            scoreLabel: true,
            isNotApplicable: true,
          },
        });

        // ── Step 2: Load examination node tree for this engagement's snapshot ──
        currentStep = "building_tree";
        const selections = await tx.engagementModule.findMany({
          where: { engagementId: validated.engagementId, tenantId },
          select: { moduleId: true },
        });
        const selectedModuleIds = new Set<string>(
          selections.map((s: { moduleId: string }) => s.moduleId),
        );

        // Spec §6.6: later catalogue edits (add bank statement, turn off,
        // pack uninstall) apply to future engagements only. Completeness and
        // scoring walk the snapshotted leaves when a snapshot exists.
        const snapshotRows = await tx.engagementStatement.findMany({
          where: {
            engagementId: validated.engagementId,
            tenantId,
            nodeId: { not: null },
          },
          select: { nodeId: true, weight: true, isCritical: true },
        });
        const snapshotByNodeId = new Map(
          snapshotRows.flatMap((row) =>
            row.nodeId ? [[row.nodeId, row] as const] : [],
          ),
        );
        const snapshotNodeIds = new Set(snapshotByNodeId.keys());

        const allNodes =
          selectedModuleIds.size === 0
            ? []
            : await tx.examinationNode.findMany({
                where: {
                  tenantId,
                  moduleId: { in: [...selectedModuleIds] },
                  // No snapshot: walk the live tree as before, active nodes
                  // only. With one, a snapshotted leaf turned off since
                  // must still count, so isActive is not filtered.
                  ...(snapshotNodeIds.size === 0 ? { isActive: true } : {}),
                },
                select: {
                  id: true,
                  code: true,
                  weight: true,
                  isCritical: true,
                  isLeaf: true,
                  parentId: true,
                  depth: true,
                  name: true,
                  path: true,
                  moduleId: true,
                },
              });
        const leafInScope = (isLeaf: boolean, id: string): boolean =>
          engagementLeafInScope(snapshotNodeIds, isLeaf, id);

        // Build response lookup: nodeId -> { scoreLabel, score }
        const responseMap = new Map<
          string,
          { scoreLabel: string | null; score: number | null }
        >();
        for (const r of responses) {
          responseMap.set(r.nodeId, {
            scoreLabel: r.scoreLabel,
            score: r.score !== null ? Number(r.score) : null,
          });
        }

        // Build tree using same two-pass Map approach as buildTree in rbia-examination.ts
        const nodeMap = new Map<
          string,
          ScoredNode & {
            depth: number;
            parentId: string | null;
            name: string;
            moduleId: string | null;
          }
        >();
        for (const n of allNodes) {
          const resp = responseMap.get(n.id);
          const snap = snapshotByNodeId.get(n.id);
          nodeMap.set(n.id, {
            nodeId: n.id,
            code: n.code,
            name: n.name,
            weight: snap ? Number(snap.weight) : Number(n.weight),
            isCritical: snap ? snap.isCritical : n.isCritical,
            isLeaf: n.isLeaf,
            scoreLabel: (resp?.scoreLabel as any) ?? null,
            children: [],
            depth: n.depth,
            parentId: n.parentId,
            moduleId: n.moduleId,
          } as ScoredNode & {
            depth: number;
            parentId: string | null;
            name: string;
            moduleId: string | null;
          });
        }

        // Link children → parents. Skip live leaves that are not in this
        // engagement's snapshot (a bank statement added after create).
        for (const node of nodeMap.values()) {
          if (!leafInScope(node.isLeaf, node.nodeId)) continue;
          if (node.parentId) {
            const parent = nodeMap.get(node.parentId);
            if (parent) parent.children.push(node);
          }
        }

        // The module's own root is the depth-1 node whose moduleId points at
        // the selected AuditModule (module-native backfill, see
        // scripts/backfill/module-native.ts).
        const moduleNodes: ScoredNode[] = [];
        for (const node of nodeMap.values()) {
          if (!leafInScope(node.isLeaf, node.nodeId)) continue;
          if (
            node.depth === 1 &&
            node.moduleId &&
            selectedModuleIds.has(node.moduleId)
          ) {
            moduleNodes.push(node);
          }
        }

        if (moduleNodes.length === 0) {
          throw Object.assign(
            new Error(
              "Cannot freeze: no examination modules are selected for this engagement",
            ),
            { code: "INCOMPLETE_EXAMINATION" },
          );
        }

        // A module selected without its statements snapshotted (added before
        // module add materialised them) has leaves but no snapshot rows.
        // Every leaf would drop out of scope, the module would score null and
        // leave the composite, and freeze would pass. Refuse instead.
        if (snapshotNodeIds.size > 0) {
          const leafModuleIds = new Set<string>();
          const snapshotModuleIds = new Set<string>();
          for (const node of nodeMap.values()) {
            if (!node.isLeaf || !node.moduleId) continue;
            leafModuleIds.add(node.moduleId);
            if (snapshotNodeIds.has(node.nodeId)) {
              snapshotModuleIds.add(node.moduleId);
            }
          }
          const unsnapshotted = [...nodeMap.values()]
            .filter(
              (node) =>
                node.depth === 1 &&
                node.moduleId &&
                selectedModuleIds.has(node.moduleId) &&
                leafModuleIds.has(node.moduleId) &&
                !snapshotModuleIds.has(node.moduleId),
            )
            .map((node) => node.code);
          if (unsnapshotted.length > 0) {
            throw Object.assign(
              new Error(
                `Cannot freeze: ${unsnapshotted.join(", ")} has no statement snapshot ` +
                  `for this engagement. Remove the module and add it again.`,
              ),
              { code: "INCOMPLETE_EXAMINATION" },
            );
          }
        }

        // ── Completeness gate ──
        currentStep = "checking_completeness";
        const leafStatuses = new Map<string, LeafStatus>();
        for (const r of responses) {
          const node = nodeMap.get(r.nodeId);
          if (!node) continue;
          leafStatuses.set(r.nodeId, {
            nodeId: r.nodeId,
            code: node.code,
            scored: r.scoreLabel != null,
            notApplicable: r.isNotApplicable,
          });
        }

        const outstanding = findUnscoredLeaves(moduleNodes, leafStatuses);
        if (outstanding.length > 0) {
          const shown = outstanding.slice(0, 10).join(", ");
          const more =
            outstanding.length > 10
              ? ` and ${outstanding.length - 10} more`
              : "";
          throw Object.assign(
            new Error(
              `Cannot freeze: ${outstanding.length} examination item(s) are neither ` +
                `scored nor marked not applicable — ${shown}${more}`,
            ),
            { code: "INCOMPLETE_EXAMINATION" },
          );
        }

        // ── Step 3: Compute per-module scores and composite score ──
        currentStep = "computing_scores";
        const moduleScoresMap: Record<string, number> = {};
        const moduleScoreInputs: Array<{
          weight: number;
          score: number | null;
        }> = [];

        for (const moduleNode of moduleNodes) {
          const moduleScore = computeModuleScore(moduleNode);
          if (moduleScore !== null) {
            moduleScoresMap[moduleNode.code] = moduleScore;
          }
          moduleScoreInputs.push({
            weight: moduleNode.weight,
            score: moduleScore,
          });
        }

        const compositeScore = computeCompositeScore(moduleScoreInputs);
        if (compositeScore === null) {
          throw new Error(
            "Cannot freeze: no examination items have been scored",
          );
        }
        const ratingBand = getRatingBand(compositeScore);

        // Build scoring tree snapshot — serialize the full ScoredNode[] tree
        // for historical drill-down (per research recommendation)
        const scoringTreeSnapshot = moduleNodes.map(function serializeNode(
          n: ScoredNode,
        ): any {
          return {
            nodeId: n.nodeId,
            code: n.code,
            name: (n as any).name ?? undefined, // Include name for human-readable display
            weight: n.weight,
            isCritical: n.isCritical,
            isLeaf: n.isLeaf,
            scoreLabel: n.scoreLabel,
            children: n.children.map(serializeNode),
          };
        });

        // ── Step 4: Write/upsert BranchRbiaScore ──
        currentStep = "writing_score";
        await tx.branchRbiaScore.upsert({
          where: { engagementId: validated.engagementId },
          create: {
            tenantId,
            engagementId: validated.engagementId,
            branchId: engagement.branchId,
            compositeScore,
            ratingBand,
            moduleScores: moduleScoresMap,
            scoringTreeSnapshot,
            frozenAt: new Date(),
            frozenById: session.user.id,
          },
          update: {
            compositeScore,
            ratingBand,
            moduleScores: moduleScoresMap,
            scoringTreeSnapshot,
            frozenAt: new Date(),
            frozenById: session.user.id,
          },
        });

        // ── Step 5: Issue all DRAFT ActionPoints (DRAFT -> ISSUED) ──
        currentStep = "issuing_action_points";
        await tx.actionPoint.updateMany({
          where: {
            engagementId: validated.engagementId,
            tenantId,
            status: "DRAFT",
          },
          data: {
            status: "ISSUED",
          },
        });

        // Count total APs for the batch (all statuses — they're all now ISSUED or already past ISSUED)
        const apCount = await tx.actionPoint.count({
          where: { engagementId: validated.engagementId, tenantId },
        });

        // ── Step 6: Create BmResponseBatch ──
        currentStep = "creating_bm_batch";
        const deadlineDays = 15; // TODO Phase 23: read from tenant.settings.bmResponseDeadlineDays
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + deadlineDays);

        // Use upsert to handle idempotent retry (see Pitfall 3 in research)
        await tx.bmResponseBatch.upsert({
          where: { engagementId: validated.engagementId },
          create: {
            tenantId,
            engagementId: validated.engagementId,
            totalActionPoints: apCount,
            deadline,
            status: "PENDING",
          },
          update: {
            totalActionPoints: apCount,
            deadline,
          },
        });

        return { compositeScore, ratingBand, apCount };
      },
    );

    // Revalidate multiple paths affected by freeze
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);
    revalidatePath(`/audit-execution`);

    return { success: true as const, data: result };
  } catch (error) {
    // Step-specific error messages (per locked decision: "specific step that failed")
    const stepMessages: Record<string, string> = {
      initializing: "Failed to initialize freeze",
      syncing_instance_scores:
        "Failed to sync instance-based scores for credit modules",
      loading_engagement: "Engagement not found or inaccessible",
      loading_responses: "Failed to load examination responses",
      building_tree: "Failed to build examination tree",
      checking_completeness: "Examination is not complete",
      computing_scores: "Failed to compute scores",
      writing_score: "Score snapshot failed",
      issuing_action_points: "Failed to issue action points",
      creating_bm_batch: "Failed to create response batch",
    };

    const thrownCode =
      error instanceof Error && (error as any).code
        ? ((error as any).code as string)
        : undefined;
    const isKnown =
      thrownCode === "SCORE_FROZEN" || thrownCode === "INCOMPLETE_EXAMINATION";
    const errorCode: ActionErrorCode = isKnown ? thrownCode : "INTERNAL_ERROR";
    const userMessage = isKnown
      ? (error as Error).message
      : (stepMessages[currentStep] ?? "Status transition blocked");

    logger.error(
      { error, currentStep, engagementId: validated.engagementId, tenantId },
      userMessage,
    );

    return {
      success: false as const,
      error: userMessage,
      code: errorCode,
    };
  }
}
