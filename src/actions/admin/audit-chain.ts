"use server";

import React from "react";
import { revalidatePath } from "next/cache";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { userActor } from "@/data-access/audited-mutation";
import {
  getChainHead,
  getChainVerifications,
  getTenantName,
} from "@/data-access/audit-chain-admin";
import { verifyTenantAuditChain } from "@/jobs/verify-audit-chain";
import { ChainAttestation } from "@/components/pdf-report/chain-attestation";

const FORBIDDEN = {
  success: false as const,
  error: "You do not have permission to manage the audit chain.",
};

/**
 * Re-verify the signed-in admin's own tenant chain from genesis, now. Only
 * this tenant: the nightly job is what walks every tenant.
 */
export async function runAuditChainVerification() {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "admin:manage_settings"))
    return FORBIDDEN;
  const tenantId = session.user.tenantId;

  try {
    const verdict = await verifyTenantAuditChain(tenantId, {
      full: true,
      actor: userActor(session),
    });
    revalidatePath("/admin/audit-chain");
    return {
      success: true as const,
      data: {
        ok: verdict.ok,
        firstBadSequence: verdict.ok
          ? null
          : verdict.firstBadSequence.toString(),
      },
    };
  } catch (error) {
    logger.error(
      { error, action: "run_audit_chain_verification", tenantId },
      "Audit chain verification could not run",
    );
    return {
      success: false as const,
      error: "Verification could not run. Try again.",
    };
  }
}

/** The chain head and recent verifications as a PDF for an examiner. */
export async function exportChainAttestation() {
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "admin:manage_settings"))
    return FORBIDDEN;
  const tenantId = session.user.tenantId;

  try {
    const [tenantName, head, history] = await Promise.all([
      getTenantName(tenantId),
      getChainHead(tenantId),
      getChainVerifications(tenantId),
    ]);
    const generatedAt = new Date();
    const pdf = await renderToBuffer(
      React.createElement(ChainAttestation, {
        tenantName,
        generatedAt,
        head,
        history,
      }) as unknown as React.ReactElement<DocumentProps>,
    );
    return {
      success: true as const,
      data: {
        base64: Buffer.from(pdf).toString("base64"),
        filename: `audit-chain-attestation-${generatedAt.toISOString().slice(0, 10)}.pdf`,
      },
    };
  } catch (error) {
    logger.error(
      { error, action: "export_chain_attestation", tenantId },
      "Audit chain attestation export failed",
    );
    return {
      success: false as const,
      error: "The attestation could not be generated. Try again.",
    };
  }
}
