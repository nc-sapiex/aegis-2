import { describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import {
  hashedCredentialAccount,
  passwordValidationError,
} from "@/lib/credential-account";

describe("passwordValidationError", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordValidationError("short")).toMatch(/at least 8/);
    expect(passwordValidationError("")).toMatch(/at least 8/);
  });

  it("accepts an 8-character password", () => {
    expect(passwordValidationError("12345678")).toBeNull();
  });
});

describe("hashedCredentialAccount", () => {
  it("builds a credential Account that Better Auth can verify", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const password = "InvitePass1!";
    const account = await hashedCredentialAccount(userId, password);

    expect(account).toMatchObject({
      userId,
      accountId: userId,
      providerId: "credential",
    });
    expect(account.password).not.toBe(password);
    expect(await verifyPassword({ hash: account.password, password })).toBe(
      true,
    );
    expect(
      await verifyPassword({
        hash: account.password,
        password: "wrong-password",
      }),
    ).toBe(false);
  });
});
