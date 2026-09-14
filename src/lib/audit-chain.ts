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
 *     | oldData-or-"null" | newData-or-"null"
 *
 * oldData/newData are pre-serialized JSON text, not JS values, and must be
 * the exact string Postgres's `jsonb::text` cast produces — e.g.
 * `{"a": 1, "b": 2}` (a space after every `:` and `,`), not
 * `JSON.stringify`'s compact `{"a":1,"b":2}`. The trigger hashes
 * `p_old_data::TEXT`/`p_new_data::TEXT` straight off the jsonb value it also
 * stores; re-deriving that text by `JSON.parse`-ing the stored value and
 * `JSON.stringify`-ing it back loses that exact form two ways: the spacing
 * differs, and a NUMERIC column (e.g. Branch.ramScore) round-trips through a
 * JS `Number` and loses trailing-zero precision ("5.00" becomes "5"). So the
 * verify job must read `"oldData"::text`/`"newData"::text` off the row
 * directly, not go through Prisma's parsed `Json` scalar.
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
  oldData: string | null;
  newData: string | null;
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
    row.oldData ?? "null",
    row.newData ?? "null",
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
