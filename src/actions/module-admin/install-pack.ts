"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { installPack } from "@/data-access/pack-install";
import { loadLicense } from "@/lib/license";
import { userActor } from "@/data-access/audited-mutation";
import { revalidatePath } from "next/cache";

export async function installPackAction(
  filePath: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "module:manage")) {
    return {
      success: false,
      error: "You do not have permission to manage modules.",
    };
  }
  const licensePublicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  if (!licensePublicKeyPem) {
    return { success: false, error: "No license public key configured." };
  }

  const host = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
    : "localhost";
  const license = loadLicense(host);
  const features =
    license.status === "valid" || license.status === "grace"
      ? license.payload.features
      : [];

  const result = await installPack(
    session.user.tenantId,
    userActor(session),
    filePath,
    licensePublicKeyPem,
    features,
  );
  if (!result.success) return result;
  revalidatePath("/settings/modules");
  return { success: true };
}
