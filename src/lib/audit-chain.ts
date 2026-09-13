import { createHash } from "node:crypto";

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

export type LinkedRow = ChainableRow & { prevHash: Buffer; rowHash: Buffer };

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)]),
    );
  }

  return value;
}

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
      : JSON.stringify(canonicalizeJson(row.oldData)),
    row.newData === null || row.newData === undefined
      ? "null"
      : JSON.stringify(canonicalizeJson(row.newData)),
  ].join("|");
}

export function hashRow(row: ChainableRow, prevHash: Buffer): Buffer {
  return createHash("sha256").update(canonicalString(row, prevHash)).digest();
}

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
