"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
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
      // Sibling scope must match the node being moved on depth/isLeaf, not
      // just tenantId/moduleId: a module's ExaminationNode tree can have
      // multiple depths (0=root, 1=module, 2=sub-module, 3+=leaf items), and
      // an unfiltered query would let a leaf statement swap displayOrder
      // with a non-leaf group node, corrupting the register's ordering.
      const siblings = await tx.examinationNode.findMany({
        where: {
          tenantId,
          moduleId: node.moduleId,
          depth: node.depth,
          isLeaf: node.isLeaf,
        },
        orderBy: { displayOrder: "asc" },
      });
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
