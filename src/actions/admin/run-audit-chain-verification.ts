"use server";

import { getChainVerifications } from "@/data-access/audit-chain-admin";
import { getRequiredSession } from "@/data-access/session";
import { verifyAuditChain } from "@/jobs/verify-audit-chain";
import { requirePermission } from "@/lib/guards";

export async function runAuditChainVerification(): Promise<
  | {
      success: true;
      data: { latest: Awaited<ReturnType<typeof getChainVerifications>>[number] };
    }
  | { success: false; error: string }
> {
  await requirePermission("admin:system");
  const session = await getRequiredSession();

  try {
    await verifyAuditChain();
    const [latest] = await getChainVerifications(session.user.tenantId);

    if (!latest) {
      return {
        success: false,
        error: "Verification ran but produced no record",
      };
    }

    return { success: true, data: { latest } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}
