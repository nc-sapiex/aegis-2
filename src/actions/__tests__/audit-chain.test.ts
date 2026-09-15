import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/audited-mutation", () => ({
  userActor: vi.fn(() => ({ kind: "user" })),
}));
vi.mock("@/data-access/audit-chain-admin", () => ({
  getChainHead: vi.fn(),
  getChainVerifications: vi.fn(),
  getTenantName: vi.fn(),
}));
vi.mock("@/jobs/verify-audit-chain", () => ({
  verifyTenantAuditChain: vi.fn(),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn() }));
vi.mock("@/components/pdf-report/chain-attestation", () => ({
  ChainAttestation: vi.fn(),
}));

import {
  exportChainAttestation,
  runAuditChainVerification,
} from "../admin/audit-chain";
import { getRequiredSession } from "@/data-access/session";
import { verifyTenantAuditChain } from "@/jobs/verify-audit-chain";
import { renderToBuffer } from "@react-pdf/renderer";
import { TENANT_A, fakeSession } from "@/test/factories";
import type { Role } from "@/lib/permissions";

const signIn = (roles: Role[]) =>
  vi
    .mocked(getRequiredSession)
    .mockResolvedValue(fakeSession({ roles }) as never);

describe("audit chain admin actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse a user without admin:manage_settings and never verify or render", async () => {
    signIn(["AUDITOR"]);

    expect((await runAuditChainVerification()).success).toBe(false);
    expect((await exportChainAttestation()).success).toBe(false);
    expect(verifyTenantAuditChain).not.toHaveBeenCalled();
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("verify-now walks only the session tenant's whole chain, as the signed-in user", async () => {
    signIn(["CAE"]);
    vi.mocked(verifyTenantAuditChain).mockResolvedValue({
      ok: false,
      firstBadSequence: 4n,
    });

    const result = await runAuditChainVerification();

    expect(verifyTenantAuditChain).toHaveBeenCalledTimes(1);
    expect(verifyTenantAuditChain).toHaveBeenCalledWith(TENANT_A, {
      full: true,
      actor: { kind: "user" },
    });
    expect(result).toEqual({
      success: true,
      data: { ok: false, firstBadSequence: "4" },
    });
  });

  it("verify-now returns an error instead of throwing when the run fails", async () => {
    signIn(["SYSTEM_ADMIN"]);
    vi.mocked(verifyTenantAuditChain).mockRejectedValue(new Error("db down"));

    const result = await runAuditChainVerification();

    expect(result.success).toBe(false);
  });
});
