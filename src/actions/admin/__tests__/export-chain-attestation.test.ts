import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, fakeSession, TENANT_A } from "@/test/factories";

const mockRenderToBuffer = vi.fn();
const mockGetChainHead = vi.fn();
const mockGetChainVerifications = vi.fn();
const mockChainAttestation = vi.fn();
const mockPrismaForTenant = vi.fn();

vi.mock("@/lib/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: (...args: unknown[]) => mockRenderToBuffer(...args) }));
vi.mock("@/data-access/audit-chain-admin", () => ({
  getChainHead: (...args: unknown[]) => mockGetChainHead(...args),
  getChainVerifications: (...args: unknown[]) => mockGetChainVerifications(...args),
}));
vi.mock("@/components/pdf-report/chain-attestation", () => ({
  ChainAttestation: (...args: unknown[]) => mockChainAttestation(...args),
}));
vi.mock("@/lib/prisma", () => ({ prismaForTenant: (...args: unknown[]) => mockPrismaForTenant(...args) }));

import { getRequiredSession } from "@/data-access/session";
import { requirePermission } from "@/lib/guards";
import { exportChainAttestation } from "../export-chain-attestation";

describe("exportChainAttestation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue(fakeSession() as never);
    vi.mocked(getRequiredSession).mockResolvedValue(fakeSession() as never);
    mockPrismaForTenant.mockReturnValue(
      fakeDb({
        tenant: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ name: "Test Bank" }),
        },
      }),
    );
    mockGetChainHead.mockResolvedValue({
      lastSequence: BigInt(4),
      lastHash: Buffer.from("abcd", "hex"),
      updatedAt: new Date("2026-09-13T10:00:00.000Z"),
    });
    mockGetChainVerifications.mockResolvedValue([
      {
        id: "verification-1",
        verifiedAt: new Date("2026-09-13T10:10:00.000Z"),
        ok: true,
        firstBadSequence: null,
      },
    ]);
    mockChainAttestation.mockReturnValue({ type: "pdf-doc" });
    mockRenderToBuffer.mockResolvedValue(Buffer.from("pdf-bytes"));
  });

  it("returns a base64 PDF payload and tenant-scoped filename", async () => {
    const result = await exportChainAttestation();

    expect(mockGetChainHead).toHaveBeenCalledWith(TENANT_A);
    expect(mockGetChainVerifications).toHaveBeenCalledWith(TENANT_A);
    expect(result).toEqual({
      success: true,
      data: {
        base64: Buffer.from("pdf-bytes").toString("base64"),
        filename: `audit-chain-attestation-${TENANT_A}.pdf`,
      },
    });
  });

  it("surfaces export failures", async () => {
    mockRenderToBuffer.mockRejectedValue(new Error("render failed"));

    const result = await exportChainAttestation();

    expect(result).toEqual({ success: false, error: "render failed" });
  });
});
