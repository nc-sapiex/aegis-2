import { createHash } from "node:crypto";

/**
 * Per-tenant SHA-256 hash chain (spec §5).
 *
 * Canonical string, joined with "|", in this exact order — the SQL trigger in
 * prisma/migrations/20260913_audit_chain.sql builds the identical string so
 * the nightly verify job can recompute it without touching the database:
 *
 *   hex(prevHash) | tenantId | sequenceNumber | tableName | recordId
 *     | operation | actorUserId-or-empty | changedAt.toISOString()
 *     | JSON.stringify(oldData)-or-"null" | JSON.stringify(newData)-or-"null"
 *
 * A null actorUserId (systemActor, spec's "the platform acting under policy")
 * canonicalizes to the empty string, matching how setSessionContext leaves
 * app.current_user_id unset for a system Actor (session-context.ts) rather
 * than writing the literal text "null".
 *
 * Pure: no Prisma, no clock, no I/O — CLAUDE.md's domain-arithmetic rule.
 */

export const GENESIS_HASH: Buffer = Buffer.alloc(32);

export type ChainableRow = {
  tenantId: string;
  sequenceNumber: bigint;
  tableName: string;
  recordId: string;
  operation: string;
  actorUserId: string | null;
  changedAt: Date;
  oldData: unknown;
  newData: unknown;
};

function canonicalString(row: ChainableRow, prevHash: Buffer): string {
  return [
    prevHash.toString("hex"),
    row.tenantId,
    row.sequenceNumber.toString(),
    row.tableName,
    row.recordId,
    row.operation,
    row.actorUserId ?? "",
    row.changedAt.toISOString(),
    row.oldData === null || row.oldData === undefined
      ? "null"
      : JSON.stringify(row.oldData),
    row.newData === null || row.newData === undefined
      ? "null"
      : JSON.stringify(row.newData),
  ].join("|");
}

export function hashRow(row: ChainableRow, prevHash: Buffer): Buffer {
  return createHash("sha256").update(canonicalString(row, prevHash)).digest();
}

export type LinkedRow = ChainableRow & { prevHash: Buffer; rowHash: Buffer };

/**
 * Walks rows in sequence order (caller's responsibility to sort). Verifies
 * each row's own rowHash against its recorded data, and that each row's
 * prevHash equals the previous row's rowHash (genesis excepted).
 */
export function verifyChain(
  rows: LinkedRow[],
  genesisPrevHash: Buffer = GENESIS_HASH,
): { ok: true } | { ok: false; firstBadSequence: bigint } {
  let expectedPrev = genesisPrevHash;
  for (const row of rows) {
    if (!row.prevHash.equals(expectedPrev)) {
      return { ok: false, firstBadSequence: row.sequenceNumber };
    }
    const expectedHash = hashRow(row, row.prevHash);
    if (!expectedHash.equals(row.rowHash)) {
      return { ok: false, firstBadSequence: row.sequenceNumber };
    }
    expectedPrev = row.rowHash;
  }
  return { ok: true };
}
