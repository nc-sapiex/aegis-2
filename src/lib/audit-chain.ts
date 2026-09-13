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
