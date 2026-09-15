import { prismaSystem } from "@/lib/prisma";
import { prismaForTenant } from "@/data-access/prisma";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";
import { logger } from "@/lib/logger";
import { verifyChain, GENESIS_HASH, type LinkedRow } from "@/lib/audit-chain";

/**
 * Nightly (02:00 IST): verify each tenant's AuditLog hash chain, record the
 * verdict in AuditChainVerification, and on a break queue a CRITICAL
 * notification to the tenant's active CAE and SYSTEM_ADMIN users. Spec §5.
 *
 * The nightly run is incremental: it checks only rows after the last clean
 * checkpoint (AuditChainHead.lastVerifiedSequence/lastVerifiedHash), chained
 * onto that checkpoint's hash, so its cost is one day's writes rather than
 * ten years of retention. The checkpoint advances only on a clean verdict,
 * so a break keeps being reported until someone deals with it.
 * An incremental run never re-hashes rows behind the checkpoint, so an edit
 * to already-verified history is invisible to it. `options.full` ignores the
 * checkpoint and walks from genesis: the weekly verify-audit-chain-full job
 * and Task 8's run-now use it. A break a full run finds behind the checkpoint
 * pulls the checkpoint back to the last good row, so every later incremental
 * run reports the same break instead of chaining on past it.
 *
 * Tenants come from real "Tenant" rows, so the pre-auth lockout rows under
 * the all-zero sentinel tenantId (which have no chain) are never visited.
 * Inside a real tenant a NULL hash is a break, never a reason to skip a row.
 */
export async function verifyAuditChain(options?: {
  full?: boolean;
}): Promise<void> {
  const tenants = await prismaSystem.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    try {
      await verifyTenant(tenant.id, options?.full ?? false);
    } catch (error) {
      logger.error(
        { action: "audit_chain_verify_error", tenantId: tenant.id, error },
        "Audit chain verification could not run for tenant",
      );
    }
  }
}

type RawAuditRow = {
  id: string;
  tenantId: string;
  sequenceNumber: bigint;
  tableName: string;
  recordId: string;
  operation: string;
  actionType: string | null;
  justification: string | null;
  userId: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  oldData: string | null;
  newData: string | null;
  createdAt: Date;
  retentionExpiresAt: Date | null;
  prevHash: Uint8Array | null;
  rowHash: Uint8Array | null;
};

// A NULL hash can never equal a 32-byte one, so the row fails verification.
const hashBuffer = (b: Uint8Array | null) =>
  b === null ? Buffer.alloc(0) : Buffer.from(b);

async function verifyTenant(tenantId: string, full: boolean): Promise<void> {
  const db = prismaForTenant(tenantId);

  // Read the head before the rows: rows committed after this read can only
  // add sequence numbers past head.lastSequence, never fall short of it.
  const head = await db.auditChainHead.findUnique({
    where: { tenantId },
    select: {
      lastSequence: true,
      lastVerifiedSequence: true,
      lastVerifiedHash: true,
    },
  });
  const since = full ? 0n : (head?.lastVerifiedSequence ?? 0n);
  const sinceHash =
    full || !head?.lastVerifiedHash
      ? GENESIS_HASH
      : Buffer.from(head.lastVerifiedHash);

  // oldData/newData as jsonb::text: the hash covers that exact text, which
  // Prisma's parsed Json scalar does not round-trip (see audit-chain.ts).
  // ponytail: loads the whole window into memory; a full run over years of
  // history wants cursor batches.
  const raw = await db.$queryRaw<RawAuditRow[]>`
    SELECT id, "tenantId", "sequenceNumber", "tableName", "recordId", operation,
           "actionType", justification, "userId", "ipAddress", "sessionId",
           "oldData"::text AS "oldData", "newData"::text AS "newData",
           "createdAt", "retentionExpiresAt", "prevHash", "rowHash"
      FROM "AuditLog"
     WHERE "tenantId" = ${tenantId}::uuid AND "sequenceNumber" > ${since}
     ORDER BY "sequenceNumber"
  `;
  const rows: LinkedRow[] = raw.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    sequenceNumber: r.sequenceNumber,
    tableName: r.tableName,
    recordId: r.recordId,
    operation: r.operation,
    actionType: r.actionType,
    justification: r.justification,
    actorUserId: r.userId,
    ipAddress: r.ipAddress,
    sessionId: r.sessionId,
    oldData: r.oldData,
    newData: r.newData,
    changedAt: r.createdAt,
    retentionExpiresAt: r.retentionExpiresAt,
    prevHash: hashBuffer(r.prevHash),
    rowHash: hashBuffer(r.rowHash),
  }));

  const last = rows.at(-1);
  const lastSequence = last?.sequenceNumber ?? since;
  let verdict = verifyChain(rows, sinceHash);
  // Deleting the newest rows breaks no hash link; only the head notices.
  if (verdict.ok && lastSequence < (head?.lastSequence ?? 0n)) {
    verdict = { ok: false, firstBadSequence: lastSequence + 1n };
  }

  await withAuditedMutation(
    systemActor(tenantId),
    "audit_chain.verified",
    async (tx) => {
      await tx.auditChainVerification.create({
        data: {
          tenantId,
          ok: verdict.ok,
          firstBadSequence: verdict.ok ? null : verdict.firstBadSequence,
        },
      });

      if (verdict.ok) {
        // updateMany + lte: a slower overlapping run never moves the
        // checkpoint backwards.
        await tx.auditChainHead.updateMany({
          where: { tenantId, lastVerifiedSequence: { lte: lastSequence } },
          data: {
            lastVerifiedSequence: lastSequence,
            lastVerifiedHash: new Uint8Array(last?.rowHash ?? sinceHash),
          },
        });
        return;
      }

      const lastGood = verdict.firstBadSequence - 1n;
      await tx.auditChainHead.updateMany({
        where: { tenantId, lastVerifiedSequence: { gt: lastGood } },
        data: {
          lastVerifiedSequence: lastGood,
          lastVerifiedHash: new Uint8Array(
            rows.find((r) => r.sequenceNumber === lastGood)?.rowHash ??
              GENESIS_HASH,
          ),
        },
      });

      const recipients = await tx.user.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          roles: { hasSome: ["CAE", "SYSTEM_ADMIN"] },
        },
        select: { id: true },
      });
      await tx.notificationQueue.createMany({
        data: recipients.map((r) => ({
          tenantId,
          recipientId: r.id,
          type: "AUDIT_CHAIN_TAMPER_DETECTED" as const,
          payload: { firstBadSequence: verdict.firstBadSequence.toString() },
        })),
      });
    },
  );

  if (verdict.ok) {
    logger.info(
      { action: "audit_chain_verified", tenantId, from: since.toString() },
      "Audit chain verified clean",
    );
  } else {
    logger.error(
      {
        action: "audit_chain_tamper_detected",
        severity: "CRITICAL",
        tenantId,
        firstBadSequence: verdict.firstBadSequence.toString(),
      },
      "Audit chain verification FAILED",
    );
  }
}
