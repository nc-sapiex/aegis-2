"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

type StatementPatch = {
  text?: string;
  weight?: number;
  isCritical?: boolean;
  isActive?: boolean;
};

export async function editStatement(
  nodeId: string,
  patch: StatementPatch,
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

  if (node.origin === "PACK" && patch.text !== undefined) {
    return {
      success: false,
      error: "Statement text is pack-owned and cannot be edited.",
    };
  }
  if (
    patch.weight !== undefined &&
    (patch.weight < 0.5 || patch.weight > 3.0)
  ) {
    return { success: false, error: "Weight must be between 0.5 and 3.0." };
  }

  return withAuditedMutation(
    userActor(session),
    "module.statement_edited",
    async (tx) => {
      await tx.examinationNode.update({
        where: { id: nodeId, tenantId },
        data: {
          ...(patch.text !== undefined
            ? { name: patch.text.slice(0, 60), description: patch.text }
            : {}),
          ...(patch.weight !== undefined ? { weight: patch.weight } : {}),
          ...(patch.isCritical !== undefined
            ? { isCritical: patch.isCritical }
            : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        },
      });
      revalidatePath("/settings/modules");
      return { success: true };
    },
  );
}
