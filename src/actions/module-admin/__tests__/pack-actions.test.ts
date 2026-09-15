import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn(),
}));
vi.mock("@/data-access/pack-install", () => ({
  installPack: vi.fn(),
  uninstallPack: vi.fn(),
}));
vi.mock("@/lib/license", () => ({ loadLicense: vi.fn() }));

import { installPackAction } from "../install-pack";
import { uninstallPackAction } from "../uninstall-pack";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { installPack, uninstallPack } from "@/data-access/pack-install";
import { loadLicense } from "@/lib/license";
import { fakeSession, TENANT_A } from "@/test/factories";

describe("uninstallPackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
  });

  it("refuses to uninstall the core pack", async () => {
    const result = await uninstallPackAction("core");

    expect(result).toEqual({
      success: false,
      error: "The core pack cannot be uninstalled.",
    });
    expect(withAuditedMutation).not.toHaveBeenCalled();
    expect(uninstallPack).not.toHaveBeenCalled();
  });

  it("rejects a session without module:manage", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );

    const result = await uninstallPackAction("example-forex");

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to manage modules.",
    });
    expect(withAuditedMutation).not.toHaveBeenCalled();
  });

  it("no-ops on a pack code with no matching install (documented behavior)", async () => {
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _a: unknown,
      _b: unknown,
      fn: (t: unknown) => unknown,
    ) => fn({})) as never);
    vi.mocked(uninstallPack).mockResolvedValue(undefined);

    const result = await uninstallPackAction("no-such-pack");

    expect(result).toEqual({ success: true });
    expect(uninstallPack).toHaveBeenCalledWith({}, TENANT_A, "no-such-pack");
  });
});

describe("installPackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
    process.env.LICENSE_PUBLIC_KEY = "test-key";
  });

  it("rejects a session without module:manage", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );

    const result = await installPackAction("/tmp/pack.zip");

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to manage modules.",
    });
    expect(installPack).not.toHaveBeenCalled();
  });

  it("refuses when no license public key is configured", async () => {
    delete process.env.LICENSE_PUBLIC_KEY;

    const result = await installPackAction("/tmp/pack.zip");

    expect(result).toEqual({
      success: false,
      error: "No license public key configured.",
    });
    expect(installPack).not.toHaveBeenCalled();
  });

  it("passes an empty features list when the license is invalid", async () => {
    vi.mocked(loadLicense).mockReturnValue({
      status: "invalid",
      reason: "expired",
    } as never);
    vi.mocked(installPack).mockResolvedValue({
      success: true,
      data: { packCode: "example-forex", version: "1.0.0" },
    });

    const result = await installPackAction("/tmp/pack.zip");

    expect(result).toEqual({ success: true });
    expect(installPack).toHaveBeenCalledWith(
      TENANT_A,
      undefined,
      "/tmp/pack.zip",
      "test-key",
      [],
    );
  });
});
