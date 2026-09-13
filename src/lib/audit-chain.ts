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

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJson(entry)]),
    );
  }

  return value;
}

function serializeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  return JSON.stringify(normalizeJson(value));
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
    serializeJson(row.oldData),
    serializeJson(row.newData),
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
