import type { Role, UserStatus } from "@/generated/prisma/enums";

/**
 * What to do with a session once the user row behind it has been re-read.
 *
 * Kept pure and separate from the Next.js boundary so the rules are testable
 * without mocking headers, redirects, and Better Auth.
 */
export type SessionDecision =
  | { kind: "ok"; tenantId: string; roles: Role[] }
  | { kind: "revoke"; reason: string }
  | { kind: "onboard" };

/** Matches prismaForTenant's own check, so an admitted tenant is always usable. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A session cookie is a snapshot taken at sign-in. This re-decides access from
 * the user row as it stands now, so a suspension or a role change takes effect
 * on the next request rather than at session expiry.
 *
 * A tenantless user is onboarding, not hostile: Better Auth creates the user
 * before the onboarding wizard assigns a tenant.
 */
export function decideSessionAccess(
  user: {
    status: UserStatus;
    tenantId: string | null;
    roles: Role[];
  } | null,
): SessionDecision {
  if (!user) {
    return { kind: "revoke", reason: "MISSING" };
  }

  if (user.status !== "ACTIVE") {
    return { kind: "revoke", reason: user.status };
  }

  if (!user.tenantId || !UUID_REGEX.test(user.tenantId)) {
    return { kind: "onboard" };
  }

  if (user.roles.length === 0) {
    return { kind: "revoke", reason: "NO_ROLES" };
  }

  return { kind: "ok", tenantId: user.tenantId, roles: user.roles };
}
