import { withAuditedMutation, systemActor } from "@/data-access/audited-mutation";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { verifyChain, type LinkedRow } from "@/lib/audit-chain";

type TenantRecord = { id: string };

type AuditLogRecord = {
  tenantId: string;
  sequenceNumber: bigint;
  tableName: string;
  recordId: string;
  operation: string;
  userId: string | null;
  createdAt: Date;
  oldData: unknown;
  newData: unknown;
  prevHash: Buffer;
  rowHash: Buffer;
};

type UserRecord = { id: string };

type VerifyAuditChainDb = {
  tenant: {
    findMany(args: { select: { id: true } }): Promise<TenantRecord[]>;
  };
  auditLog: {
    findMany(args: {
      where: { tenantId: string };
      orderBy: { sequenceNumber: "asc" };
      select: {
        tenantId: true;
        sequenceNumber: true;
        tableName: true;
        recordId: true;
        operation: true;
        userId: true;
        createdAt: true;
        oldData: true;
        newData: true;
        prevHash: true;
        rowHash: true;
      };
    }): Promise<AuditLogRecord[]>;
  };
  user: {
    findMany(args: {
      where: { tenantId: string; roles: { hasSome: string[] } };
      select: { id: true };
    }): Promise<UserRecord[]>;
  };
};

type VerifyAuditChainTx = {
  auditChainVerification: {
    create(args: {
      data: {
        tenantId: string;
        ok: boolean;
        firstBadSequence: bigint | null;
      };
    }): Promise<unknown>;
  };
  notificationQueue: {
    create(args: {
      data: {
        tenantId: string;
        recipientId: string;
        type: string;
        status: string;
        payload: { firstBadSequence: string };
      };
    }): Promise<unknown>;
  };
};

const db = prisma as unknown as VerifyAuditChainDb;

/**
 * Nightly (02:00 IST): walk every tenant's AuditLog chain, record the verdict,
 * and raise a CRITICAL notification on the first broken sequence.
 */
export async function verifyAuditChain(): Promise<void> {
  const tenants = await db.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const rows = await db.auditLog.findMany({
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
      prevHash: row.prevHash,
      rowHash: row.rowHash,
    }));

    const verdict = verifyChain(linked);

    await withAuditedMutation(
      systemActor(tenant.id),
      "audit_chain.verified",
      async (tx) => {
        const verifyTx = tx as unknown as VerifyAuditChainTx;

        await verifyTx.auditChainVerification.create({
          data: {
            tenantId: tenant.id,
            ok: verdict.ok,
            firstBadSequence: verdict.ok ? null : verdict.firstBadSequence,
          },
        });

        if (!verdict.ok) {
          const recipients = await db.user.findMany({
            where: {
              tenantId: tenant.id,
              roles: { hasSome: ["CAE", "SYSTEM_ADMIN"] },
            },
            select: { id: true },
          });

          for (const recipient of recipients) {
            await verifyTx.notificationQueue.create({
              data: {
                tenantId: tenant.id,
                recipientId: recipient.id,
                type: "AUDIT_CHAIN_TAMPER_DETECTED",
                status: "PENDING",
                payload: {
                  firstBadSequence: verdict.firstBadSequence.toString(),
                },
              },
            });
          }
        }
      },
    );

    logger.info(
      { action: "audit_chain_verified", tenantId: tenant.id, ok: verdict.ok },
      verdict.ok
        ? "Audit chain verified clean"
        : "Audit chain verification FAILED",
    );
  }
}
