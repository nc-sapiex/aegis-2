import { z } from "zod";

/**
 * Rules for passwords AEGIS creates itself, as distinct from ones Better Auth
 * receives through its own sign-up route.
 *
 * The character classes match what the signup form already scores and what the
 * invitation form already claims, so the server now refuses what the client
 * merely discourages. Shared with the client so both show the same message.
 */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[0-9]/, "Password must contain a digit.");
