"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { parentPath } from "@/lib/examination-path";
import { revalidatePath } from "next/cache";

export async function reorderStatement(
  nodeId: string,
  direction: "up" | "down",
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const node = await db.examinationNode.findFirst({
    where: { id: nodeId, tenantId },
  });
  if (!node) return { success: false, error: "Statement not found." };

  return withAuditedMutation(
    userActor(session),
    "module.statement_reordered",
    async (tx) => {
      // Sibling scope must match the node being moved on parentId (not just
      // depth/isLeaf/moduleId): displayOrder is a position within one parent
      // group (schema comment: "Weight within parent group"), and a module
      // can have several sub-modules at the same depth sharing moduleId
      // (e.g. CRD-HLN's 6 depth-2 sub-modules, each with its own depth-3
      // leaves). Without parentId, reordering a leaf can swap displayOrder
      // with a leaf under a *different* sub-module, corrupting both groups'
      // ordering — depth/isLeaf alone only rules out swapping across levels,
      // not across sibling groups at the same level.
      //
      // Pack install historically left parentId null, so two nodes can share
      // parentId: null while belonging to different sections; resolve each
      // candidate's own path-derived parent (see freeze.ts's identical
      // fallback) instead of trusting a raw parentId match.
      const moduleNodes = await tx.examinationNode.findMany({
        where: { tenantId, moduleId: node.moduleId },
        select: {
          id: true,
          parentId: true,
          path: true,
          depth: true,
          isLeaf: true,
          displayOrder: true,
        },
      });
      const idByPath = new Map(moduleNodes.map((n) => [n.path, n.id]));
      const resolveParentId = (n: {
        parentId: string | null;
        path: string;
      }): string | null => {
        if (n.parentId) return n.parentId;
        const parentP = parentPath(n.path);
        return parentP ? (idByPath.get(parentP) ?? null) : null;
      };
      const nodeParentId = resolveParentId(node);
      const siblings = moduleNodes
        .filter(
          (n) =>
            n.depth === node.depth &&
            n.isLeaf === node.isLeaf &&
            resolveParentId(n) === nodeParentId,
        )
        .sort((a, b) => a.displayOrder - b.displayOrder);
      const index = siblings.findIndex((s) => s.id === nodeId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= siblings.length) {
        // Already at the boundary — a no-op, not an error.
        return { success: true };
      }
      const other = siblings[swapIndex];
      await tx.examinationNode.update({
        where: { id: node.id },
        data: { displayOrder: other.displayOrder },
      });
      await tx.examinationNode.update({
        where: { id: other.id },
        data: { displayOrder: node.displayOrder },
      });
      revalidatePath("/settings/modules");
      return { success: true };
    },
  );
}
