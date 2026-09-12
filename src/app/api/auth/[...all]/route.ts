import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth API route handler
 *
 * This catch-all route handles all Better Auth endpoints:
 * - /api/auth/sign-up/email
 * - /api/auth/sign-in/email
 * - /api/auth/sign-out
 * - /api/auth/session
 * - And more...
 *
 * Better Auth automatically handles all auth-related requests through this route.
 */
export const { POST, GET } = toNextJsHandler(auth);
