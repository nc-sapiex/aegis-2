import { describe, expect, it, vi } from "vitest";
import { confirmAndUninstall } from "../confirm-uninstall";

// #202: InstalledPacksList was status-only — it never called
// uninstallPackAction, so the button had nothing behind it. This is the
// component/unit-test leg of that fix: this repo has no DOM-rendering test
// setup (vitest runs `environment: "node"`, no @testing-library/react), so
// confirmAndUninstall is exercised directly, with the confirm dialog and the
// server action both mocked, rather than by rendering the component.
describe("confirmAndUninstall", () => {
  it("calls uninstallPackAction with the pack's code once the operator confirms", async () => {
    const uninstallPackAction = vi.fn().mockResolvedValue({ success: true });
    const confirm = vi.fn().mockReturnValue(true);

    const result = await confirmAndUninstall("example-forex", "Example Forex", {
      confirm,
      uninstallPackAction,
    });

    expect(uninstallPackAction).toHaveBeenCalledTimes(1);
    expect(uninstallPackAction).toHaveBeenCalledWith("example-forex");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("Example Forex");
    expect(result).toEqual({ success: true });
  });

  it("does not call uninstallPackAction when the operator cancels the confirm dialog", async () => {
    const uninstallPackAction = vi.fn().mockResolvedValue({ success: true });
    const confirm = vi.fn().mockReturnValue(false);

    const result = await confirmAndUninstall("example-forex", "Example Forex", {
      confirm,
      uninstallPackAction,
    });

    expect(uninstallPackAction).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("propagates a failed uninstall result unchanged", async () => {
    const uninstallPackAction = vi.fn().mockResolvedValue({
      success: false,
      error: "The core pack cannot be uninstalled.",
    });
    const confirm = vi.fn().mockReturnValue(true);

    const result = await confirmAndUninstall("core", "AEGIS Core", {
      confirm,
      uninstallPackAction,
    });

    expect(result).toEqual({
      success: false,
      error: "The core pack cannot be uninstalled.",
    });
  });
});
