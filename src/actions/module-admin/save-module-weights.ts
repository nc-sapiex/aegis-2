"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function saveModuleWeights(
  input: { moduleId: string; weight: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }

  for (const { weight } of input) {
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      return {
        success: false,
        error: `Weight must be an integer from 1 to 100 (got ${weight}).`,
      };
    }
  }

  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const modules = await db.auditModule.findMany({
    where: { tenantId, id: { in: input.map((i) => i.moduleId) } },
  });
  if (modules.length !== input.length) {
    return { success: false, error: "One or more modules were not found." };
  }

  return withAuditedMutation(
    userActor(session),
    "module.weights_updated",
    async (tx) => {
      for (const { moduleId, weight } of input) {
        await tx.auditModule.update({
          where: { id: moduleId, tenantId },
          data: { weight },
        });
      }
      revalidatePath("/settings/modules");
      return { success: true };
    },
  );
}
