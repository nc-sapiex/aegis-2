import { createHash } from "node:crypto";

/**
 * Per-tenant SHA-256 hash chain (spec §5).
 *
 * Canonical string covers every "AuditLog" column except "rowHash" itself,
 * in this exact order — the SQL trigger in
 * prisma/sql/010_audit_trigger_function.sql builds the identical string so
 * the nightly verify job can recompute it without touching the database:
 *
 *   prevHash, id, tenantId, sequenceNumber, tableName, recordId, operation,
 *   actionType, justification, userId, ipAddress, sessionId, oldData,
 *   newData, createdAt, retentionExpiresAt
 *
 * Each field is encoded by field() below, then concatenated with NO
 * separator: field()'s length-prefix encoding (`-` for NULL, otherwise
 * `<UTF-8 byte length>:<value>`) makes the concatenation unambiguous on its
 * own, unlike the previous "|"-joined format, where content could shift
 * across a field boundary without changing the hash (e.g. actionType "a|b"
 * + justification "c" hashed the same as actionType "a" + justification
 * "b|c"). The byte length is counted in UTF-8 bytes (`Buffer.byteLength`),
 * not JS string `.length` (UTF-16 code units), matching Postgres's
 * `octet_length(convert_to(v, 'UTF8'))` for any multi-byte character.
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
 * is a genuinely absent value, distinct from the empty string — matching how
 * setSessionContext leaves app.current_user_id unset for a system Actor
 * (session-context.ts) rather than writing the literal text "". NULL and ""
 * hash differently for every nullable field in this format (field(null) is
 * "-"; field("") is "0:").
 *
 * Pure: no Prisma, no clock, no I/O — CLAUDE.md's domain-arithmetic rule.
 */

export const GENESIS_HASH: Buffer = Buffer.alloc(32);

export type ChainableRow = {
  id: string;
  tenantId: string;
  sequenceNumber: bigint;
  tableName: string;
  recordId: string;
  operation: string;
  actionType: string | null;
  justification: string | null;
  actorUserId: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  oldData: string | null;
  newData: string | null;
  changedAt: Date;
  retentionExpiresAt: Date | null;
};

/** NULL -> "-"; non-NULL v -> "<UTF-8 byte length of v>:" || v. */
function field(v: string | null): string {
  if (v === null) return "-";
  return `${Buffer.byteLength(v, "utf8")}:${v}`;
}

function isoMs(d: Date): string {
  return d.toISOString();
}

function canonicalString(row: ChainableRow, prevHash: Buffer): string {
  return (
    field(prevHash.toString("hex")) +
    field(row.id) +
    field(row.tenantId) +
    field(row.sequenceNumber.toString()) +
    field(row.tableName) +
    field(row.recordId) +
    field(row.operation) +
    field(row.actionType) +
    field(row.justification) +
    field(row.actorUserId) +
    field(row.ipAddress) +
    field(row.sessionId) +
    field(row.oldData) +
    field(row.newData) +
    field(isoMs(row.changedAt)) +
    field(
      row.retentionExpiresAt === null ? null : isoMs(row.retentionExpiresAt),
    )
  );
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
