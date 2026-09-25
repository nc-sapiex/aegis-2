import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type { ScoreLabel } from "@/generated/prisma/enums";
import {
  evaluateApplicability,
  type BranchProfile,
} from "@/lib/module-applicability";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
import { resolveParentId } from "@/lib/examination-path";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Data Access Layer for RBIA Examination tree and module selection.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Convert Decimal fields at DAL boundary
 * 5. Return typed data
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExaminationResponseData = {
  id: string;
  score: number | null;
  scoreLabel: ScoreLabel | null;
  remarks: string | null;
  flagForObservation: boolean;
  flagForActionPoint: boolean;
  respondedAt: Date | null;
};

export type ExaminationTreeNode = {
  id: string;
  code: string;
  name: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  parentId: string | null;
  weight: number;
  isCritical: boolean;
  riskCategory: string | null;
  regulatoryRef: string | null;
  applicableBranchTypes: string[];
  description: string | null;
  displayOrder: number;
  response: ExaminationResponseData | null;
  children: ExaminationTreeNode[];
};

/** Internal flat node before tree reconstruction — not exported */
type FlatNode = Omit<ExaminationTreeNode, "children" | "response"> & {
  responses: ExaminationResponseData[];
};

// ─── buildTree ───────────────────────────────────────────────────────────────

/**
 * Pure function: reconstructs a tree from a flat array of nodes.
 * O(n) with two-pass Map approach — no DB access.
 *
 * Silently skips orphaned nodes (parentId references an inactive/missing node).
 */
export function buildTree(flatNodes: FlatNode[]): ExaminationTreeNode[] {
  // First pass: build map of id → tree node
  const nodeMap = new Map<string, ExaminationTreeNode>();
  for (const n of flatNodes) {
    nodeMap.set(n.id, {
      id: n.id,
      code: n.code,
      name: n.name,
      path: n.path,
      depth: n.depth,
      isLeaf: n.isLeaf,
      parentId: n.parentId,
      weight: n.weight,
      isCritical: n.isCritical,
      riskCategory: n.riskCategory,
      regulatoryRef: n.regulatoryRef,
      applicableBranchTypes: n.applicableBranchTypes,
      description: n.description,
      displayOrder: n.displayOrder,
      response: n.responses[0] ?? null,
      children: [],
    });
  }

  // Second pass: link children to parents. Pack install historically left
  // parentId null; fall back to the slash-separated path (see freeze.ts's
  // identical fallback) so a housing-style tree still nests instead of
  // flattening every node into its own root.
  const idByPath = new Map(flatNodes.map((n) => [n.path, n.id]));
  const roots: ExaminationTreeNode[] = [];
  for (const treeNode of nodeMap.values()) {
    const isRootByParentId = treeNode.parentId === null;
    const parentId = resolveParentId(
      treeNode,
      (id) => nodeMap.has(id),
      idByPath,
    );
    const parent = parentId ? nodeMap.get(parentId) : undefined;
    if (parent && parent.id !== treeNode.id) {
      parent.children.push(treeNode);
    } else if (isRootByParentId) {
      roots.push(treeNode);
    }
    // else: parentId points at an inactive/missing node with no
    // path-derivable parent either — orphaned, skip silently
  }

  // Sort children by displayOrder at each level
  function sortChildren(nodes: ExaminationTreeNode[]): void {
    nodes.sort((a, b) => a.displayOrder - b.displayOrder);
    for (const n of nodes) {
      if (n.children.length > 0) sortChildren(n.children);
    }
  }

  roots.sort((a, b) => a.displayOrder - b.displayOrder);
  for (const root of roots) {
    sortChildren(root.children);
  }

  return roots;
}

// ─── getExaminationTree ──────────────────────────────────────────────────────

/**
 * Load entire active ExaminationNode tree for a tenant with per-engagement responses.
 * Single findMany (no N+1) — responses joined via nested select filtered by engagementId.
 */
export async function getExaminationTree(
  session: Session,
  engagementId: string,
): Promise<ExaminationTreeNode[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const rawNodes = await db.examinationNode.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ depth: "asc" }, { displayOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      path: true,
      depth: true,
      isLeaf: true,
      parentId: true,
      weight: true,
      isCritical: true,
      riskCategory: true,
      regulatoryRef: true,
      applicableBranchTypes: true,
      description: true,
      displayOrder: true,
      responses: {
        where: { engagementId },
        select: {
          id: true,
          score: true,
          scoreLabel: true,
          remarks: true,
          flagForObservation: true,
          flagForActionPoint: true,
          respondedAt: true,
        },
      },
    },
  });

  // Convert Decimal fields at DAL boundary
  const flatNodes: FlatNode[] = rawNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    path: n.path,
    depth: n.depth,
    isLeaf: n.isLeaf,
    parentId: n.parentId,
    weight: Number(n.weight),
    isCritical: n.isCritical,
    riskCategory: n.riskCategory,
    regulatoryRef: n.regulatoryRef,
    applicableBranchTypes: n.applicableBranchTypes,
    description: n.description,
    displayOrder: n.displayOrder,
    responses: n.responses.map((r) => ({
      id: r.id,
      score: r.score !== null ? Number(r.score) : null,
      scoreLabel: r.scoreLabel,
      remarks: r.remarks,
      flagForObservation: r.flagForObservation,
      flagForActionPoint: r.flagForActionPoint,
      respondedAt: r.respondedAt,
    })),
  }));

  return buildTree(flatNodes);
}

// ─── branch profile lookup ───────────────────────────────────────────────────

const EMPTY_BRANCH_PROFILE: BranchProfile = {
  hasForex: false,
  hasCurrencyChest: false,
  hasGovtBusiness: false,
  hasLockers: false,
  hasAtm: false,
  loanProducts: [],
};

/**
 * The engagement's branch profile, for applicability evaluation. `branchId`
 * is nullable until Task 10 makes a branch mandatory for RBIA engagements;
 * an engagement with no branch yet gets the empty profile, so only
 * always-applicable ({}) modules match.
 */
async function getEngagementBranchProfile(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
  engagementId: string,
): Promise<BranchProfile> {
  const engagement = await db.auditEngagement.findFirst({
    where: { id: engagementId, tenantId },
    select: {
      branch: {
        select: {
          hasForex: true,
          hasCurrencyChest: true,
          hasGovtBusiness: true,
          hasLockers: true,
          hasAtm: true,
          loanProducts: true,
        },
      },
    },
  });
  return engagement?.branch ?? EMPTY_BRANCH_PROFILE;
}

// ─── getApplicableModules ────────────────────────────────────────────────────

/**
 * Return all active AuditModules whose applicability predicate matches the
 * engagement's branch profile.
 */
export async function getApplicableModules(
  session: Session,
  engagementId: string,
): Promise<{ id: string; code: string; name: string }[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const branch = await getEngagementBranchProfile(db, tenantId, engagementId);

  const modules = await db.auditModule.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true, applicability: true },
    orderBy: { code: "asc" },
  });

  return modules.filter((m) => evaluateApplicability(m.applicability, branch));
}

// ─── autoSelectModules ───────────────────────────────────────────────────────

/**
 * Create EngagementModule rows for every module applicable to the
 * engagement's branch. Uses createMany with skipDuplicates to be idempotent.
 */
export async function autoSelectModules(
  session: Session,
  engagementId: string,
): Promise<void> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const applicableModules = await getApplicableModules(session, engagementId);

  await db.$transaction(async (tx) => {
    const existing = await tx.engagementModule.findMany({
      where: { tenantId, engagementId },
      select: { moduleId: true },
    });
    const alreadySelected = new Set(existing.map((e) => e.moduleId));
    const added = applicableModules
      .map((m) => m.id)
      .filter((id) => !alreadySelected.has(id));
    if (added.length === 0) return;

    await tx.engagementModule.createMany({
      data: added.map((moduleId) => ({
        tenantId,
        engagementId,
        moduleId,
        isAutoSelected: true,
        selectionReason: "Auto-selected based on branch profile",
      })),
      skipDuplicates: true,
    });
    // Snapshot only the modules added now: re-snapshotting the others would
    // pull in statements added to them since (spec §6.6).
    await materializeEngagementStatements(
      tx as unknown as Prisma.TransactionClient,
      engagementId,
      tenantId,
      added,
    );
  });
}

// ─── getModuleSelections ─────────────────────────────────────────────────────

/**
 * Return current module selections for an engagement, ordered by creation time.
 */
export async function getModuleSelections(
  session: Session,
  engagementId: string,
) {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  return db.engagementModule.findMany({
    where: { tenantId, engagementId },
    include: {
      module: {
        select: { id: true, code: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ─── addModuleSelection ──────────────────────────────────────────────────────

/**
 * Manually add a module to an engagement's selection with a documented reason.
 * Snapshots the new module's statements in the same transaction so the
 * register and freeze see them (spec §6.6).
 */
export async function addModuleSelection(
  session: Session,
  engagementId: string,
  moduleId: string,
  reason: string,
) {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  return db.$transaction(async (tx) => {
    const created = await tx.engagementModule.create({
      data: {
        tenantId,
        engagementId,
        moduleId,
        isAutoSelected: false,
        selectionReason: reason,
      },
    });
    await materializeEngagementStatements(
      tx as unknown as Prisma.TransactionClient,
      engagementId,
      tenantId,
      [moduleId],
    );
    return created;
  });
}

// ─── removeModuleSelection ───────────────────────────────────────────────────

/**
 * Remove a module from an engagement's selection (supports manual override removal).
 * The `reason` parameter is accepted for API contract consistency — the server action
 * records it via audit context (justification field) before calling this function.
 */
export async function removeModuleSelection(
  session: Session,
  engagementId: string,
  moduleId: string,
  _reason: string, // Passed for API contract; audit context set by server action
): Promise<void> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  await db.engagementModule.delete({
    where: {
      engagementId_moduleId: { engagementId, moduleId },
    },
  });
}

// ─── getAllModules ────────────────────────────────────────────────────────────

/**
 * Return ALL active AuditModules regardless of branch applicability.
 * Used to populate the Add Module checklist dialog — shows all possible modules
 * so an auditor can manually select any module for inclusion.
 */
export async function getAllModules(
  session: Session,
): Promise<{ id: string; code: string; name: string }[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  return db.auditModule.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}
