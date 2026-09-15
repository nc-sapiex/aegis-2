"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { uninstallPack } from "@/data-access/pack-install";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function uninstallPackAction(
  packCode: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }
  if (packCode === "core") {
    return { success: false, error: "The core pack cannot be uninstalled." };
  }

  const tenantId = session.user.tenantId;
  return withAuditedMutation(
    userActor(session),
    "pack.uninstalled",
    async (tx) => {
      await uninstallPack(tx, tenantId, packCode);
      revalidatePath("/settings/modules");
      return { success: true };
    },
  );
}
