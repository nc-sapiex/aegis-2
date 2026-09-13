"use server";

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getChainHead, getChainVerifications } from "@/data-access/audit-chain-admin";
import { getRequiredSession } from "@/data-access/session";
import { ChainAttestation } from "@/components/pdf-report/chain-attestation";
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

    const buffer = Buffer.from(
      await renderToBuffer(
        React.createElement(ChainAttestation, {
          tenantName: tenant.name,
          generatedAt: new Date(),
          head,
          history,
        }) as any,
      ),
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
