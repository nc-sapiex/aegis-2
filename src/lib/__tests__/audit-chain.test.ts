import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  GENESIS_HASH,
  hashRow,
  verifyChain,
  type ChainableRow,
} from "@/lib/audit-chain";

function row(overrides: Partial<ChainableRow> = {}): ChainableRow {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    sequenceNumber: 1n,
    tableName: "Branch",
    recordId: "22222222-2222-4222-8222-222222222222",
    operation: "INSERT",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    changedAt: new Date("2026-09-13T10:15:30.123Z"),
    oldData: null,
    newData: { code: "A001", name: "A Branch" },
    ...overrides,
  };
}

describe("hashRow", () => {
  it("is a deterministic 32-byte value for a fixed test vector", () => {
    const expectedCanonical =
      "0000000000000000000000000000000000000000000000000000000000000000" +
      "|11111111-1111-4111-8111-111111111111|1|Branch|22222222-2222-4222-8222-222222222222|INSERT" +
      "|33333333-3333-4333-8333-333333333333|2026-09-13T10:15:30.123Z" +
      "|null|" +
      JSON.stringify({ code: "A001", name: "A Branch" });
    const expected = createHash("sha256").update(expectedCanonical).digest();

    const result = hashRow(row(), GENESIS_HASH);

    expect(result).toEqual(expected);
    expect(result).toHaveLength(32);
  });

  it("changes when any single field changes (avalanche, not exhaustive)", () => {
    const base = hashRow(row(), GENESIS_HASH);
    const changedRecordId = hashRow(
      row({ recordId: "99999999-9999-4999-8999-999999999999" }),
      GENESIS_HASH,
    );
    const changedNewData = hashRow(
      row({ newData: { code: "A001", name: "Tampered" } }),
      GENESIS_HASH,
    );
    const changedPrevHash = hashRow(row(), Buffer.alloc(32, 1));

    expect(changedRecordId.equals(base)).toBe(false);
    expect(changedNewData.equals(base)).toBe(false);
    expect(changedPrevHash.equals(base)).toBe(false);
  });

  it("a null actorUserId (system actor) hashes to the empty-string slot, not the literal 'null'", () => {
    const withSystemActor = hashRow(row({ actorUserId: null }), GENESIS_HASH);
    const withEmptyString = hashRow(row({ actorUserId: "" }), GENESIS_HASH);
    expect(withSystemActor.equals(withEmptyString)).toBe(true);
  });
});

describe("verifyChain", () => {
  function chainOf(
    rows: ChainableRow[],
  ): (ChainableRow & { prevHash: Buffer; rowHash: Buffer })[] {
    let prev = GENESIS_HASH;
    return rows.map((r) => {
      const rowHash = hashRow(r, prev);
      const linked = { ...r, prevHash: prev, rowHash };
      prev = rowHash;
      return linked;
    });
  }

  it("reports ok for a clean chain of three rows", () => {
    const rows = chainOf([
      row({ sequenceNumber: 1n }),
      row({ sequenceNumber: 2n }),
      row({ sequenceNumber: 3n }),
    ]);
    expect(verifyChain(rows)).toEqual({ ok: true });
  });

  it("reports the first bad sequence when a middle row's data was edited after hashing", () => {
    const rows = chainOf([
      row({ sequenceNumber: 1n }),
      row({ sequenceNumber: 2n }),
      row({ sequenceNumber: 3n }),
    ]);
    rows[1] = {
      ...rows[1],
      newData: { code: "A001", name: "Edited by a superuser" },
    };
    expect(verifyChain(rows)).toEqual({ ok: false, firstBadSequence: 2n });
  });

  it("reports the first bad sequence when a middle row is deleted (gap in prevHash linkage)", () => {
    const rows = chainOf([
      row({ sequenceNumber: 1n }),
      row({ sequenceNumber: 2n }),
      row({ sequenceNumber: 3n }),
    ]);
    const withGap = [rows[0], rows[2]]; // row 2 deleted; row 3's prevHash no longer matches row 1's rowHash
    expect(verifyChain(withGap)).toEqual({ ok: false, firstBadSequence: 3n });
  });

  it("an empty chain is ok", () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });
});
