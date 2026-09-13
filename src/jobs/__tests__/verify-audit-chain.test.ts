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
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
  },
}));

vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(
    async (_actor: unknown, _action: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        auditChainVerification: { create: (...args: unknown[]) => mockCreate(...args) },
        notificationQueue: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
      }),
  ),
  systemActor: (tenantId: string) => ({ kind: "system", tenantId }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("verifyAuditChain", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockTenantFindMany.mockReset();
    mockCreate.mockReset();
    mockNotificationCreate.mockReset();
    mockUserFindMany.mockReset();
  });

  it("writes ok:true for a clean tenant chain", async () => {
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

  it("writes ok:false and queues CRITICAL notifications for a broken chain", async () => {
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
        }),
      }),
    );
  });
});
