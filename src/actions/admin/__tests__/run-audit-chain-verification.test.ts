import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/factories";

vi.mock("@/lib/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/jobs/verify-audit-chain", () => ({ verifyAuditChain: vi.fn() }));
vi.mock("@/data-access/audit-chain-admin", () => ({ getChainVerifications: vi.fn() }));

import { getChainVerifications } from "@/data-access/audit-chain-admin";
import { getRequiredSession } from "@/data-access/session";
import { requirePermission } from "@/lib/guards";
import { verifyAuditChain } from "@/jobs/verify-audit-chain";
import { runAuditChainVerification } from "../run-audit-chain-verification";

describe("runAuditChainVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue(fakeSession() as never);
    vi.mocked(getRequiredSession).mockResolvedValue(fakeSession() as never);
  });

  it("returns the latest verification row after a successful run", async () => {
    const latest = {
      id: "verification-1",
      verifiedAt: new Date("2026-09-13T10:20:00.000Z"),
      ok: true,
      firstBadSequence: null,
    };

    vi.mocked(getChainVerifications).mockResolvedValue([latest]);

    const result = await runAuditChainVerification();

    expect(verifyAuditChain).toHaveBeenCalledTimes(1);
    expect(getChainVerifications).toHaveBeenCalledWith(
      fakeSession().user.tenantId,
    );
    expect(result).toEqual({ success: true, data: { latest } });
  });

  it("returns a clear error when the run produced no verification row", async () => {
    vi.mocked(getChainVerifications).mockResolvedValue([]);

    const result = await runAuditChainVerification();

    expect(result).toEqual({
      success: false,
      error: "Verification ran but produced no record",
    });
  });

  it("surfaces a verification failure", async () => {
    vi.mocked(verifyAuditChain).mockRejectedValue(new Error("boom"));

    const result = await runAuditChainVerification();

    expect(result).toEqual({ success: false, error: "boom" });
  });
});
