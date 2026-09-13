"use server";

import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getChainHead, getChainVerifications } from "@/data-access/audit-chain-admin";
import { getRequiredSession } from "@/data-access/session";
import { ChainAttestation, type ChainAttestationProps } from "@/components/pdf-report/chain-attestation";
import { requirePermission } from "@/lib/guards";
import { prismaForTenant } from "@/lib/prisma";

export async function exportChainAttestation(): Promise<
  | { success: true; data: { base64: string; filename: string } }
  | { success: false; error: string }
> {
  await requirePermission("admin:system");
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  try {
    const db = prismaForTenant(tenantId);
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    const [head, history] = await Promise.all([
      getChainHead(tenantId),
      getChainVerifications(tenantId),
    ]);
    const attestationProps = {
      tenantName: tenant.name,
      generatedAt: new Date(),
      head,
      history,
    } satisfies ChainAttestationProps;
    const document = React.createElement(
      ChainAttestation,
      attestationProps,
    ) as React.ReactElement<DocumentProps>;

    const buffer = Buffer.from(
      await renderToBuffer(document),
    );

    return {
      success: true,
      data: {
        base64: buffer.toString("base64"),
        filename: `audit-chain-attestation-${tenantId}.pdf`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Export failed",
    };
  }
}
