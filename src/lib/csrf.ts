import { headers } from "next/headers";
import { env } from "@/env";

/**
 * Verify request origin matches the application URL.
 * Use in all non-GET API routes to prevent cross-site request forgery.
 *
 * @throws Error if origin/referer doesn't match BETTER_AUTH_URL
 */
export async function verifyCsrf() {
  const headersList = await headers();
  const origin = headersList.get("origin");
  const referer = headersList.get("referer");
  const allowedOrigin = env.BETTER_AUTH_URL;

  // Check origin header first (most reliable)
  if (origin && !origin.startsWith(allowedOrigin)) {
    throw new Error("CSRF validation failed: origin mismatch");
  }

  // Fallback to referer check
  if (!origin && referer && !referer.startsWith(allowedOrigin)) {
    throw new Error("CSRF validation failed: referer mismatch");
  }
}
