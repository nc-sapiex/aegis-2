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
    include: { packInstall: true },
  });
  const coreIds = new Set(
    modules.filter((m) => m.packInstall?.packCode === "core").map((m) => m.id),
  );
  // Core modules can never be zero-weighted or switched off (spec §7.6 D4) — this action
  // only ever writes a positive weight (checked above), so the core rule is already
  // satisfied by the 1-100 range check; this set exists for the isActive action (Task 5)
  // to consult, not for this one to branch on further.
  void coreIds;

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
