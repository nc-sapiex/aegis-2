import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GENESIS_HASH, hashRow, verifyChain, type ChainableRow } from "@/lib/audit-chain";

function row(overrides: Partial<ChainableRow> = {}): ChainableRow {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    sequenceNumber: BigInt(1),
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

    expect(hashRow(row(), GENESIS_HASH)).toEqual(expected);
    expect(hashRow(row(), GENESIS_HASH)).toHaveLength(32);
  });

  it("changes when any single field changes", () => {
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

  it("treats a null actor as the empty-string slot", () => {
    const withSystemActor = hashRow(row({ actorUserId: null }), GENESIS_HASH);
    const withEmptyString = hashRow(row({ actorUserId: "" }), GENESIS_HASH);

    expect(withSystemActor.equals(withEmptyString)).toBe(true);
  });

  it("canonicalizes JSON key order before hashing", () => {
    const left = hashRow(
      row({ newData: { code: "A001", meta: { branch: "A", city: "Pune" } } }),
      GENESIS_HASH,
    );
    const right = hashRow(
      row({ newData: { meta: { city: "Pune", branch: "A" }, code: "A001" } }),
      GENESIS_HASH,
    );

    expect(left.equals(right)).toBe(true);
  });
});

describe("verifyChain", () => {
  function chainOf(rows: ChainableRow[]) {
    let prev = GENESIS_HASH;

    return rows.map((current) => {
      const rowHash = hashRow(current, prev);
      const linked = { ...current, prevHash: prev, rowHash };
      prev = rowHash;
      return linked;
    });
  }

  it("reports ok for a clean chain", () => {
    const rows = chainOf([
      row({ sequenceNumber: BigInt(1) }),
      row({ sequenceNumber: BigInt(2) }),
      row({ sequenceNumber: BigInt(3) }),
    ]);

    expect(verifyChain(rows)).toEqual({ ok: true });
  });

  it("reports the first bad sequence when row data changes", () => {
    const rows = chainOf([
      row({ sequenceNumber: BigInt(1) }),
      row({ sequenceNumber: BigInt(2) }),
      row({ sequenceNumber: BigInt(3) }),
    ]);
    rows[1] = { ...rows[1], newData: { code: "A001", name: "Edited" } };

    expect(verifyChain(rows)).toEqual({
      ok: false,
      firstBadSequence: BigInt(2),
    });
  });

  it("reports the first bad sequence when a middle row is deleted", () => {
    const rows = chainOf([
      row({ sequenceNumber: BigInt(1) }),
      row({ sequenceNumber: BigInt(2) }),
      row({ sequenceNumber: BigInt(3) }),
    ]);

    expect(verifyChain([rows[0], rows[2]])).toEqual({
      ok: false,
      firstBadSequence: BigInt(3),
    });
  });

  it("treats an empty chain as ok", () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });
});
