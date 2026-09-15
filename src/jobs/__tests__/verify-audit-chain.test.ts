import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENESIS_HASH, hashRow, type ChainableRow } from "@/lib/audit-chain";

const {
  tenantFindMany,
  headFindUnique,
  queryRaw,
  verificationCreate,
  headUpdateMany,
  userFindMany,
  notificationCreateMany,
} = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  headFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  verificationCreate: vi.fn(),
  headUpdateMany: vi.fn(),
  userFindMany: vi.fn(),
  notificationCreateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prismaSystem: { tenant: { findMany: tenantFindMany } },
}));
vi.mock("@/data-access/prisma", () => ({
  prismaForTenant: vi.fn(() => ({
    auditChainHead: { findUnique: headFindUnique },
    $queryRaw: queryRaw,
  })),
}));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(
    async (_actor: unknown, _action: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        auditChainVerification: { create: verificationCreate },
        auditChainHead: { updateMany: headUpdateMany },
        user: { findMany: userFindMany },
        notificationQueue: { createMany: notificationCreateMany },
      }),
  ),
  systemActor: (tenantId: string) => ({ kind: "system", tenantId }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { verifyAuditChain } from "../verify-audit-chain";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

/** Rows shaped as the job's $queryRaw returns them, with a valid chain. */
function chain(tenantId: string, n: number) {
  const rows = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const row = {
      id: `00000000-0000-4000-8000-00000000000${i}`,
      tenantId,
      sequenceNumber: BigInt(i),
      tableName: "Branch",
      recordId: `r${i}`,
      operation: "INSERT",
      actionType: "branch.created",
      justification: null,
      userId: null,
      ipAddress: null,
      sessionId: null,
      oldData: null,
      newData: `{"n": ${i}}`,
      createdAt: new Date(`2026-09-15T06:00:0${i}.000Z`),
      retentionExpiresAt: null,
    };
    const asChainable: ChainableRow = {
      ...row,
      actorUserId: row.userId,
      changedAt: row.createdAt,
    };
    const rowHash = hashRow(asChainable, prev);
    rows.push({ ...row, prevHash: new Uint8Array(prev), rowHash });
    prev = rowHash;
  }
  return rows;
}

/** The interpolated values of the job's $queryRaw call: [tenantId, since]. */
const queryValues = (call = 0) => queryRaw.mock.calls[call].slice(1);

describe("verifyAuditChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFindMany.mockResolvedValue([{ id: T1 }]);
    userFindMany.mockResolvedValue([{ id: "cae" }, { id: "admin" }]);
  });

  it("checks only rows after the checkpoint and advances it on a clean chain", async () => {
    const rows = chain(T1, 3);
    headFindUnique.mockResolvedValue({
      lastSequence: 3n,
      lastVerifiedSequence: 1n,
      lastVerifiedHash: rows[0].rowHash,
    });
    queryRaw.mockResolvedValue(rows.slice(1));

    await verifyAuditChain();

    expect(queryValues()).toEqual([T1, 1n]);
    expect(verificationCreate).toHaveBeenCalledWith({
      data: { tenantId: T1, ok: true, firstBadSequence: null },
    });
    const update = headUpdateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      tenantId: T1,
      lastVerifiedSequence: 1n,
    });
    expect(update.data.lastVerifiedSequence).toBe(3n);
    expect(Buffer.from(update.data.lastVerifiedHash)).toEqual(rows[2].rowHash);
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it("reports an edited row, notifies CAE and SYSTEM_ADMIN, and holds the checkpoint", async () => {
    const rows = chain(T1, 3);
    rows[1].newData = `{"n": 999}`;
    headFindUnique.mockResolvedValue({
      lastSequence: 3n,
      lastVerifiedSequence: 0n,
      lastVerifiedHash: null,
    });
    queryRaw.mockResolvedValue(rows);

    await verifyAuditChain();

    expect(verificationCreate).toHaveBeenCalledWith({
      data: { tenantId: T1, ok: false, firstBadSequence: 2n },
    });
    expect(userFindMany.mock.calls[0][0].where).toEqual({
      tenantId: T1,
      status: "ACTIVE",
      roles: { hasSome: ["CAE", "SYSTEM_ADMIN"] },
    });
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: ["cae", "admin"].map((recipientId) => ({
        tenantId: T1,
        recipientId,
        type: "AUDIT_CHAIN_TAMPER_DETECTED",
        payload: { firstBadSequence: "2" },
      })),
    });
    // Only ever pulls the checkpoint back to the last good row, never forward.
    expect(headUpdateMany.mock.calls[0][0].where).toEqual({
      tenantId: T1,
      lastVerifiedSequence: { gt: 1n },
    });
  });

  it("treats a NULL hash inside a real tenant as a break", async () => {
    const rows = chain(T1, 2);
    (rows[1] as { rowHash: Uint8Array | null }).rowHash = null;
    headFindUnique.mockResolvedValue({
      lastSequence: 2n,
      lastVerifiedSequence: 0n,
      lastVerifiedHash: null,
    });
    queryRaw.mockResolvedValue(rows);

    await verifyAuditChain();

    expect(verificationCreate.mock.calls[0][0].data).toMatchObject({
      ok: false,
      firstBadSequence: 2n,
    });
  });

  it("reports deleted newest rows, which break no hash link, from the head", async () => {
    headFindUnique.mockResolvedValue({
      lastSequence: 3n,
      lastVerifiedSequence: 0n,
      lastVerifiedHash: null,
    });
    queryRaw.mockResolvedValue(chain(T1, 2));

    await verifyAuditChain();

    expect(verificationCreate.mock.calls[0][0].data).toMatchObject({
      ok: false,
      firstBadSequence: 3n,
    });
  });

  it("full: true ignores the checkpoint and verifies from genesis", async () => {
    headFindUnique.mockResolvedValue({
      lastSequence: 3n,
      lastVerifiedSequence: 2n,
      lastVerifiedHash: Buffer.alloc(32, 7),
    });
    queryRaw.mockResolvedValue(chain(T1, 3));

    await verifyAuditChain({ full: true });

    expect(queryValues()).toEqual([T1, 0n]);
    expect(verificationCreate.mock.calls[0][0].data.ok).toBe(true);
  });

  it("a full run that finds a break behind the checkpoint pulls the checkpoint back", async () => {
    const rows = chain(T1, 3);
    rows[1].newData = `{"n": 999}`;
    headFindUnique.mockResolvedValue({
      lastSequence: 3n,
      lastVerifiedSequence: 3n,
      lastVerifiedHash: rows[2].rowHash,
    });
    queryRaw.mockResolvedValue(rows);

    await verifyAuditChain({ full: true });

    const update = headUpdateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      tenantId: T1,
      lastVerifiedSequence: { gt: 1n },
    });
    expect(update.data.lastVerifiedSequence).toBe(1n);
    expect(Buffer.from(update.data.lastVerifiedHash)).toEqual(rows[0].rowHash);
  });

  it("keeps going to the next tenant when one tenant's run throws", async () => {
    tenantFindMany.mockResolvedValue([{ id: T1 }, { id: T2 }]);
    headFindUnique.mockResolvedValue(null);
    queryRaw
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce([]);

    await verifyAuditChain();

    expect(verificationCreate).toHaveBeenCalledTimes(1);
    expect(verificationCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: T2,
      ok: true,
    });
  });
});
