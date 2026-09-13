import { withAuditedMutation, systemActor } from "@/data-access/audited-mutation";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { verifyChain, type LinkedRow } from "@/lib/audit-chain";

export async function verifyAuditChain(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sequenceNumber: "asc" },
      select: {
        tenantId: true,
        sequenceNumber: true,
        tableName: true,
        recordId: true,
        operation: true,
        userId: true,
        createdAt: true,
        oldData: true,
        newData: true,
        prevHash: true,
        rowHash: true,
      },
    });

    const linked: LinkedRow[] = rows.map((row) => ({
      tenantId: row.tenantId,
      sequenceNumber: row.sequenceNumber,
      tableName: row.tableName,
      recordId: row.recordId,
      operation: row.operation,
      actorUserId: row.userId,
      changedAt: row.createdAt,
      oldData: row.oldData,
      newData: row.newData,
      prevHash: (row.prevHash as Buffer | null) ?? Buffer.alloc(0),
      rowHash: (row.rowHash as Buffer | null) ?? Buffer.alloc(0),
    }));

    const verdict = verifyChain(linked);

    await withAuditedMutation(systemActor(tenant.id), "audit_chain.verified", async (tx) => {
      await tx.auditChainVerification.create({
        data: {
          tenantId: tenant.id,
          ok: verdict.ok,
          firstBadSequence: verdict.ok ? null : verdict.firstBadSequence,
        },
      });

      if (!verdict.ok) {
        const recipients = await prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            roles: { hasSome: ["CAE", "SYSTEM_ADMIN"] as never },
          },
          select: { id: true },
        });

        for (const recipient of recipients) {
          await tx.notificationQueue.create({
            data: {
              tenantId: tenant.id,
              recipientId: recipient.id,
              type: "AUDIT_CHAIN_TAMPER_DETECTED",
              status: "PENDING",
              payload: { firstBadSequence: verdict.firstBadSequence.toString() },
            },
          });
        }
      }
    });

    logger.info(
      { action: "audit_chain_verified", tenantId: tenant.id, ok: verdict.ok },
      verdict.ok ? "Audit chain verified clean" : "Audit chain verification FAILED",
    );
  }
}
