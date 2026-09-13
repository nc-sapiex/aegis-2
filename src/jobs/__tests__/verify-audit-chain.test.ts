import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockTenantFindMany = vi.fn();
const mockCreate = vi.fn();
const mockNotificationCreate = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args) },
    auditLog: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(
    async (_actor: unknown, _action: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        auditChainVerification: {
          create: (...args: unknown[]) => mockCreate(...args),
        },
        notificationQueue: {
          create: (...args: unknown[]) => mockNotificationCreate(...args),
        },
        user: {
          findMany: (...args: unknown[]) => mockUserFindMany(...args),
        },
      }),
  ),
  systemActor: (tenantId: string) => ({ kind: "system", tenantId }),
}));

describe("verifyAuditChain", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindMany.mockReset();
    mockTenantFindMany.mockReset();
    mockCreate.mockReset();
    mockNotificationCreate.mockReset();
    mockUserFindMany.mockReset();
  });

  it("writes ok:true for a tenant with a clean chain", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1" }]);
    mockFindMany.mockResolvedValue([]);

    const { verifyAuditChain } = await import("@/jobs/verify-audit-chain");

    await verifyAuditChain();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", ok: true }),
      }),
    );
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("writes ok:false with firstBadSequence and queues a CRITICAL notification on a broken chain", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1" }]);
    mockFindMany.mockResolvedValue([
      {
        tenantId: "t1",
        sequenceNumber: BigInt(1),
        tableName: "Branch",
        recordId: "r1",
        operation: "INSERT",
        userId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        oldData: null,
        newData: { a: 1 },
        prevHash: Buffer.alloc(32),
        rowHash: Buffer.from("wrong-hash-not-32-bytes-padded00", "utf8"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "u1" }]);

    const { verifyAuditChain } = await import("@/jobs/verify-audit-chain");

    await verifyAuditChain();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          ok: false,
          firstBadSequence: BigInt(1),
        }),
      }),
    );
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          recipientId: "u1",
          type: "AUDIT_CHAIN_TAMPER_DETECTED",
          status: "PENDING",
          payload: { firstBadSequence: "1" },
        }),
      }),
    );
  });

  it("writes ok:false when prevHash does not link to the previous row", async () => {
    const { GENESIS_HASH, hashRow } = await import("@/lib/audit-chain");
    const firstRow = {
      tenantId: "t1",
      sequenceNumber: BigInt(1),
      tableName: "Branch",
      recordId: "r1",
      operation: "INSERT",
      actorUserId: null,
      changedAt: new Date("2026-01-01T00:00:00.000Z"),
      oldData: null,
      newData: { a: 1 },
    };

    mockTenantFindMany.mockResolvedValue([{ id: "t1" }]);
    mockFindMany.mockResolvedValue([
      {
        ...firstRow,
        userId: firstRow.actorUserId,
        createdAt: firstRow.changedAt,
        prevHash: GENESIS_HASH,
        rowHash: hashRow(firstRow, GENESIS_HASH),
      },
      {
        tenantId: "t1",
        sequenceNumber: BigInt(2),
        tableName: "Branch",
        recordId: "r2",
        operation: "UPDATE",
        userId: null,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        oldData: { a: 1 },
        newData: { a: 2 },
        prevHash: Buffer.alloc(32, 9),
        rowHash: Buffer.alloc(32, 3),
      },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "u1" }]);

    const { verifyAuditChain } = await import("@/jobs/verify-audit-chain");

    await verifyAuditChain();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          ok: false,
          firstBadSequence: BigInt(2),
        }),
      }),
    );
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          recipientId: "u1",
          type: "AUDIT_CHAIN_TAMPER_DETECTED",
          status: "PENDING",
          payload: { firstBadSequence: "2" },
        }),
      }),
    );
  });
});
