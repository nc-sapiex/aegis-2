"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function toggleModule(
  moduleId: string,
  isActive: boolean,
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
  const mod = await db.auditModule.findFirst({
    where: { id: moduleId, tenantId },
    include: { packInstall: true },
  });
  if (!mod) return { success: false, error: "Module not found." };
  if (!isActive && mod.packInstall?.packCode === "core") {
    return { success: false, error: "A core module cannot be switched off." };
  }

  return withAuditedMutation(
    userActor(session),
    "module.toggled",
    async (tx) => {
      await tx.auditModule.update({
        where: { id: moduleId, tenantId },
        data: { isActive },
      });
      revalidatePath("/settings/modules");
      return { success: true };
    },
  );
}
