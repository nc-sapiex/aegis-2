import { hasPermission, type Permission, type Role } from "@/lib/permissions";

/**
 * Any of these admits /dashboard. RISK_HEAD was omitted from the page gate
 * even though the nav already treats dashboard:risk_head as dashboard access.
 */
export const DASHBOARD_PERMISSIONS: Permission[] = [
  "dashboard:auditor",
  "dashboard:manager",
  "dashboard:cae",
  "dashboard:cco",
  "dashboard:ceo",
  "dashboard:risk_head",
];

export function hasDashboardAccess(roles: Role[]): boolean {
  return DASHBOARD_PERMISSIONS.some((permission) =>
    hasPermission(roles, permission),
  );
}

/**
 * Landing path after login. Must never be /dashboard for a role that
 * requireAnyPermission would bounce off /dashboard — that loop is
 * ERR_TOO_MANY_REDIRECTS.
 */
export function postLoginHome(roles: Role[]): string {
  if (hasDashboardAccess(roles)) return "/dashboard";
  if (hasPermission(roles, "observation:read")) return "/auditee";
  if (hasPermission(roles, "compliance:read")) return "/compliance";
  return "/dashboard";
}

const BRANCH_SCOPED_OBSERVATION_ROLES: ReadonlySet<Role> = new Set([
  "AUDITEE",
  "BRANCH_HEAD",
]);

/**
 * AUDITEE / BRANCH_HEAD may read observations only for assigned branches.
 * A user who also holds a tenant-wide observation:read role (auditor, CAE,
 * RISK_HEAD, …) keeps the full tenant list.
 */
export function isBranchScopedObservationReader(roles: Role[]): boolean {
  const hasTenantWideRead = roles.some(
    (role) =>
      !BRANCH_SCOPED_OBSERVATION_ROLES.has(role) &&
      hasPermission([role], "observation:read"),
  );
  if (hasTenantWideRead) return false;
  return roles.some((role) => BRANCH_SCOPED_OBSERVATION_ROLES.has(role));
}
