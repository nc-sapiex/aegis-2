import "server-only";
import { cache } from "react";
import { auth } from "@/lib/auth";
import type { AuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decideSessionAccess } from "@/lib/session-guard";
import type { Role } from "@/generated/prisma/enums";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** The columns that decide access, re-read on every request. */
const ACCESS_COLUMNS = {
  id: true,
  status: true,
  tenantId: true,
  roles: true,
} as const;

/**
 * Read the session and the current user row behind it.
 *
 * Wrapped in React's cache so the extra query runs once per request even
 * though dashboard pages call getRequiredSession a dozen times.
 */
const loadSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: ACCESS_COLUMNS,
  });

  return { session, user, decision: decideSessionAccess(user) };
});

/** End every session for a user who may no longer hold one. */
async function revokeSessions(userId: string, reason: string) {
  await prisma.session.deleteMany({ where: { userId } });
  logger.warn(
    { action: "session_revoked", userId, reason },
    "Revoked sessions for a user who is no longer active",
  );
}

/**
 * Get authenticated session or redirect to login.
 * MUST be used in all DAL functions and server actions.
 *
 * CRITICAL SECURITY (Skeptic S2):
 * - tenantId MUST come from this session ONLY
 * - NEVER accept tenantId from URL params, request body, or query string
 * - DAL functions accept session object returned by this function
 *
 * The returned tenantId and roles come from the user row, not the cookie, so
 * the AuthSession types are now earned rather than asserted.
 */
export async function getRequiredSession(): Promise<AuthSession> {
  const { session, decision } = await loadSession();

  if (decision.kind === "revoke") {
    await revokeSessions(session.user.id, decision.reason);
    redirect("/login");
  }

  if (decision.kind === "onboard") {
    redirect("/onboarding");
  }

  return {
    ...session,
    user: {
      ...session.user,
      tenantId: decision.tenantId,
      roles: decision.roles,
    },
  } as unknown as AuthSession;
}

/**
 * Session for the onboarding wizard, where a tenant does not exist yet.
 *
 * Applies every check getRequiredSession applies except the tenant one, so the
 * wizard is reachable without the tenant redirect looping back onto itself.
 */
export async function getOnboardingSession(): Promise<
  Omit<AuthSession, "user"> & {
    user: Omit<AuthSession["user"], "tenantId"> & { tenantId: string | null };
  }
> {
  const { session, user, decision } = await loadSession();

  if (decision.kind === "revoke") {
    await revokeSessions(session.user.id, decision.reason);
    redirect("/login");
  }

  return {
    ...session,
    user: {
      ...session.user,
      tenantId: user?.tenantId ?? null,
      roles: (user?.roles ?? []) as Role[],
    },
  } as unknown as Omit<AuthSession, "user"> & {
    user: Omit<AuthSession["user"], "tenantId"> & { tenantId: string | null };
  };
}

/**
 * Get session without redirect (for optional auth checks).
 * Returns null if not authenticated.
 */
export async function getOptionalSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

/**
 * Get current user's tenant ID from session.
 * Helper for DAL functions.
 */
export async function getCurrentTenantId(): Promise<string> {
  const session = await getRequiredSession();
  return session.user.tenantId; // No cast needed — AuthSession types it as string
}

/**
 * Get user roles from session.
 *
 * Returns the roles array from the authenticated user.
 */
export async function getSessionRoles(): Promise<Role[]> {
  const session = await getRequiredSession();
  return session.user.roles; // No cast needed — AuthSession types it as Role[]
}

/**
 * Check if user has a specific role.
 *
 * @param role - Role to check for
 * @returns true if user has the role, false otherwise
 */
export async function hasRole(role: Role): Promise<boolean> {
  const roles = await getSessionRoles();
  return roles.includes(role);
}

/**
 * Check if user has any of the specified roles.
 *
 * @param roles - Array of roles to check for
 * @returns true if user has any of the roles, false otherwise
 */
export async function hasAnyRole(roles: Role[]): Promise<boolean> {
  const userRoles = await getSessionRoles();
  return roles.some((role) => userRoles.includes(role));
}

/**
 * Check if user has all of the specified roles.
 *
 * @param roles - Array of roles to check for
 * @returns true if user has all of the roles, false otherwise
 */
export async function hasAllRoles(roles: Role[]): Promise<boolean> {
  const userRoles = await getSessionRoles();
  return roles.every((role) => userRoles.includes(role));
}
