import { randomUUID } from "crypto";
import { hashPassword } from "better-auth/crypto";

/**
 * Shape of a Better Auth credential Account row.
 *
 * Login looks up Account by (providerId="credential", accountId=userId) and
 * verifies Account.password with the same hasher. Seeded users are created
 * this way; invited users must be too or they cannot sign in.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordValidationError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashedCredentialAccount(
  userId: string,
  password: string,
) {
  return {
    id: randomUUID(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(password),
  };
}
