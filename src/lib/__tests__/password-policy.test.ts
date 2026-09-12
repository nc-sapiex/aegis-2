import { describe, it, expect } from "vitest";
import { PasswordSchema } from "@/lib/password-policy";

describe("PasswordSchema", () => {
  it("accepts a password with the required character classes", () => {
    expect(PasswordSchema.safeParse("Branch2026audit").success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = PasswordSchema.safeParse("Ab1cdef");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("rejects a password with no uppercase letter", () => {
    const result = PasswordSchema.safeParse("branch2026audit");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Password must contain an uppercase letter.",
    );
  });

  it("rejects a password with no digit", () => {
    const result = PasswordSchema.safeParse("BranchAuditReview");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Password must contain a digit.",
    );
  });

  it("rejects a password longer than 128 characters", () => {
    expect(PasswordSchema.safeParse(`Aa1${"x".repeat(126)}`).success).toBe(
      false,
    );
  });
});
