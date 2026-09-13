import { describe, expect, it } from "vitest";
import { GENESIS_HASH, hashRow } from "@/lib/audit-chain";

describe("hashRow", () => {
  it("hashes equivalent JSON objects the same regardless of key order", () => {
    const baseRow = {
      tenantId: "t1",
      sequenceNumber: BigInt(1),
      tableName: "AuditLog",
      recordId: "r1",
      operation: "UPDATE",
      actorUserId: "u1",
      changedAt: new Date("2026-01-01T00:00:00.000Z"),
      oldData: { nested: { a: 1, b: 2 }, z: 9 },
    };

    expect(
      hashRow(
        {
          ...baseRow,
          newData: { alpha: 1, nested: { x: 1, y: 2 } },
        },
        GENESIS_HASH,
      ),
    ).toEqual(
      hashRow(
        {
          ...baseRow,
          newData: { nested: { y: 2, x: 1 }, alpha: 1 },
        },
        GENESIS_HASH,
      ),
    );
  });
});
