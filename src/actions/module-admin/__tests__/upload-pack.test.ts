import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/lib/pack/inspect", () => ({ readPackArchive: vi.fn() }));
vi.mock("@/lib/pack/sign", () => ({ verifyPackManifest: vi.fn() }));
vi.mock("../install-pack", () => ({ installPackAction: vi.fn() }));

import { uploadPackAction } from "../upload-pack";
import { installPackAction } from "../install-pack";
import { getRequiredSession } from "@/data-access/session";
import { readPackArchive } from "@/lib/pack/inspect";
import { verifyPackManifest } from "@/lib/pack/sign";
import { fakeSession } from "@/test/factories";

function packFormData(name = "example-forex-1.0.0.aegispack") {
  const formData = new FormData();
  formData.set("pack", new File([new Uint8Array([1, 2, 3])], name));
  return formData;
}

describe("uploadPackAction", () => {
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

    const result = await uploadPackAction(packFormData());

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to manage modules.",
    });
    expect(installPackAction).not.toHaveBeenCalled();
  });

  it("rejects a request with no file", async () => {
    const result = await uploadPackAction(new FormData());

    expect(result).toEqual({
      success: false,
      error: "No pack file was uploaded.",
    });
    expect(installPackAction).not.toHaveBeenCalled();
  });

  it("refuses when no license public key is configured", async () => {
    delete process.env.LICENSE_PUBLIC_KEY;

    const result = await uploadPackAction(packFormData());

    expect(result).toEqual({
      success: false,
      error: "No license public key configured.",
    });
    expect(installPackAction).not.toHaveBeenCalled();
  });

  // #201: given an unsigned or corrupted pack fixture, returns
  // { success: false } and does not call installPackAction.
  it("rejects a corrupted archive without calling installPackAction", async () => {
    vi.mocked(readPackArchive).mockRejectedValue(new Error("not a tar file"));

    const result = await uploadPackAction(packFormData());

    expect(result).toEqual({
      success: false,
      error: "The uploaded file is not a valid pack archive.",
    });
    expect(installPackAction).not.toHaveBeenCalled();
  });

  it("rejects an unsigned/invalid-signature archive without calling installPackAction", async () => {
    vi.mocked(readPackArchive).mockResolvedValue({
      manifest: { id: "example-forex", version: "1.0.0" },
    } as never);
    vi.mocked(verifyPackManifest).mockReturnValue(false);

    const result = await uploadPackAction(packFormData());

    expect(result).toEqual({ success: false, error: "Signature invalid." });
    expect(installPackAction).not.toHaveBeenCalled();
  });

  it("calls installPackAction with the stored file's name once the archive verifies", async () => {
    vi.mocked(readPackArchive).mockResolvedValue({
      manifest: { id: "example-forex", version: "1.0.0" },
    } as never);
    vi.mocked(verifyPackManifest).mockReturnValue(true);
    vi.mocked(installPackAction).mockResolvedValue({ success: true });

    const result = await uploadPackAction(packFormData());

    expect(result).toEqual({ success: true });
    expect(installPackAction).toHaveBeenCalledTimes(1);
    const passedName = vi.mocked(installPackAction).mock.calls[0][0];
    expect(passedName).toMatch(/\.aegispack$/);
  });
});
