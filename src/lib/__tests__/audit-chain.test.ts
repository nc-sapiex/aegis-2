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
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: "11111111-1111-4111-8111-111111111111",
    sequenceNumber: 1n,
    tableName: "Branch",
    recordId: "22222222-2222-4222-8222-222222222222",
    operation: "INSERT",
    actionType: "branch.created",
    justification: null,
    actorUserId: "33333333-3333-4333-8333-333333333333",
    ipAddress: "127.0.0.1",
    sessionId: "sess-1",
    changedAt: new Date("2026-09-13T10:15:30.123Z"),
    oldData: null,
    // Postgres's jsonb::text format: a space after every ":" and ",", not
    // JSON.stringify's compact form — see audit-chain.ts's doc comment.
    newData: '{"code": "A001", "name": "A Branch"}',
    retentionExpiresAt: new Date("2036-09-13T10:15:30.123Z"),
    ...overrides,
  };
}

/** Length-prefix encoder mirroring audit-chain.ts's private field(), for
 * building expected canonical strings by hand in tests. */
function f(v: string | null): string {
  if (v === null) return "-";
  return `${Buffer.byteLength(v, "utf8")}:${v}`;
}

describe("hashRow", () => {
  it("is a deterministic 32-byte value for a fixed test vector", () => {
    const r = row();
    const expectedCanonical =
      f("0".repeat(64)) +
      f(r.id) +
      f(r.tenantId) +
      f("1") +
      f(r.tableName) +
      f(r.recordId) +
      f(r.operation) +
      f(r.actionType) +
      f(r.justification) +
      f(r.actorUserId) +
      f(r.ipAddress) +
      f(r.sessionId) +
      f(r.oldData) +
      f(r.newData) +
      f(r.changedAt.toISOString()) +
      f(r.retentionExpiresAt!.toISOString());
    const expected = createHash("sha256").update(expectedCanonical).digest();

    const result = hashRow(r, GENESIS_HASH);

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
      row({ newData: '{"code": "A001", "name": "Tampered"}' }),
      GENESIS_HASH,
    );
    const changedPrevHash = hashRow(row(), Buffer.alloc(32, 1));

    expect(changedRecordId.equals(base)).toBe(false);
    expect(changedNewData.equals(base)).toBe(false);
    expect(changedPrevHash.equals(base)).toBe(false);
  });

  it("a null actorUserId (system actor) hashes differently from an empty-string one", () => {
    // NULL ("-") and "" ("0:") are different byte sequences in the
    // length-prefixed encoding — unlike the old "|"-joined format, where
    // both canonicalized to the same empty slot between two "|"s.
    const withSystemActor = hashRow(row({ actorUserId: null }), GENESIS_HASH);
    const withEmptyString = hashRow(row({ actorUserId: "" }), GENESIS_HASH);
    expect(withSystemActor.equals(withEmptyString)).toBe(false);
  });

  it("a null justification hashes differently from an empty-string one", () => {
    const withNull = hashRow(row({ justification: null }), GENESIS_HASH);
    const withEmptyString = hashRow(row({ justification: "" }), GENESIS_HASH);
    expect(withNull.equals(withEmptyString)).toBe(false);
  });

  it("content cannot shift across a field boundary (the old '|'-join ambiguity is gone)", () => {
    // Under the previous "|"-joined format, actionType "a|b" + justification
    // "c" canonicalized identically to actionType "a" + justification "b|c"
    // (both produced "...a|b|c..."). The length-prefixed encoding fixes
    // this: each field's byte length is recorded before its content, so a
    // shifted boundary changes the prefixes too.
    const shiftedLeft = hashRow(
      row({ actionType: "a|b", justification: "c" }),
      GENESIS_HASH,
    );
    const shiftedRight = hashRow(
      row({ actionType: "a", justification: "b|c" }),
      GENESIS_HASH,
    );
    expect(shiftedLeft.equals(shiftedRight)).toBe(false);
  });

  it("counts UTF-8 bytes, not UTF-16 code units, for the length prefix", () => {
    // "₹5,00,000 नियमित" has multi-byte characters (₹ is 3 bytes, and the
    // Devanagari characters are 3 bytes each in UTF-8) — its UTF-8 byte
    // length differs from its JS string .length (UTF-16 code units). If
    // hashRow used .length instead of Buffer.byteLength, this would hash
    // differently than the hand-computed vector below.
    const justification = "₹5,00,000 नियमित";
    expect(justification.length).not.toBe(
      Buffer.byteLength(justification, "utf8"),
    );

    const r = row({ justification });
    const expectedCanonical =
      f("0".repeat(64)) +
      f(r.id) +
      f(r.tenantId) +
      f("1") +
      f(r.tableName) +
      f(r.recordId) +
      f(r.operation) +
      f(r.actionType) +
      f(r.justification) +
      f(r.actorUserId) +
      f(r.ipAddress) +
      f(r.sessionId) +
      f(r.oldData) +
      f(r.newData) +
      f(r.changedAt.toISOString()) +
      f(r.retentionExpiresAt!.toISOString());
    const expected = createHash("sha256").update(expectedCanonical).digest();

    expect(hashRow(r, GENESIS_HASH)).toEqual(expected);
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
      newData: '{"code": "A001", "name": "Edited by a superuser"}',
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
