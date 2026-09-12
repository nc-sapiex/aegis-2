/**
 * Role-Based Access Control (RBAC) Permission System
 *
 * This module defines roles, permissions, and helper functions for checking
 * access control. Supports multi-role users (Decision D13, D20).
 *
 * Multi-role support:
 * - Users can hold multiple roles: roles Role[]
 * - Permission checks use roles.includes() not role === (D20)
 * - getPermissions() returns union of all role permissions
 */

import { Role as PrismaRole } from "@/generated/prisma/enums";

/**
 * User roles in the AEGIS platform.
 * Re-exported from Prisma schema to ensure type compatibility.
 */
export type Role = PrismaRole;
export const Role = PrismaRole;

/**
 * Granular permissions across the platform.
 * Each permission represents a specific action or capability.
 */
export type Permission =
  // Observation Management
  | "observation:create"
  | "observation:read"
  | "observation:review"
  | "observation:approve"
  | "observation:close_low_medium"
  | "observation:close_high_critical"
  // Compliance Management
  | "compliance:read"
  | "compliance:update"
  | "compliance:mark_na"
  // Audit Plans
  | "audit_plan:read"
  | "audit_plan:create"
  | "audit_plan:manage"
  // Reports
  | "report:read"
  | "report:generate"
  | "report:add_commentary"
  // Administration
  | "admin:manage_users"
  | "admin:manage_roles"
  | "admin:manage_settings"
  // Audit Trail
  | "audit_trail:read"
  // Dashboard Access
  | "dashboard:auditor"
  | "dashboard:manager"
  | "dashboard:cae"
  | "dashboard:cco"
  | "dashboard:ceo"
  // RAM & Audit Execution (Phase 1)
  | "ram:read"
  | "ram:create"
  | "ram:approve"
  | "audit_execution:read"
  | "audit_execution:manage_team"
  | "audit_execution:manage_sections"
  | "audit_execution:create"
  | "examination:respond"
  | "examination:read"
  | "bh_certificate:sign"
  // Compliance Lifecycle (Phase 2)
  | "compliance:branch_response"
  | "compliance:zac_review"
  | "compliance:ace_process"
  | "compliance:acb_report"
  | "report:approve"
  | "template:manage"
  | "calendar:manage"
  // GRC & Issue Management (Phase 3)
  | "risk_register:read"
  | "risk_register:manage"
  | "control_library:read"
  | "control_library:manage"
  | "issue:read"
  | "issue:manage"
  | "issue:accept_risk"
  | "work_program:read"
  | "work_program:execute"
  | "qa_assessment:read"
  | "qa_assessment:manage"
  | "audit_universe:read"
  | "audit_universe:manage"
  // UCB Regulatory & Governance (Phase 4)
  | "concurrent_audit:read"
  | "concurrent_audit:execute"
  | "regulatory:read"
  | "regulatory:manage"
  | "regulatory:atr_submit"
  | "policy:read"
  | "policy:manage"
  | "committee:read"
  | "committee:manage"
  | "housekeeping:read"
  | "housekeeping:manage"
  | "board:workspace"
  | "board:agenda"
  | "board:reporting"
  | "risk_mis:read"
  | "escalation:compute"
  | "admin:system"
  // IS Audit (R89)
  | "is_audit:read"
  | "is_audit:manage"
  // Risk Head Dashboard (R90)
  | "dashboard:risk_head"
  // RBIA v6.0 (Phase 20)
  | "rbia:examine"
  | "rbia:score_freeze"
  | "action_point:manage"
  | "action_point:bm_respond";

/**
 * Role-to-permission mapping.
 * Each role has a specific set of permissions.
 *
 * BOARD_OBSERVER: Reserved for future use, no permissions yet (DE9).
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  AUDITOR: [
    "observation:create",
    "observation:read",
    "compliance:read",
    "audit_plan:read",
    "dashboard:auditor",
  ],
  AUDIT_MANAGER: [
    "observation:read",
    "observation:review",
    "observation:close_low_medium",
    "audit_plan:create",
    "audit_plan:manage",
    "compliance:read",
    "compliance:update",
    "report:read",
    "ram:read",
    "ram:create",
    "template:manage",
    "calendar:manage",
    "risk_register:read",
    "risk_register:manage",
    "control_library:read",
    "control_library:manage",
    "issue:read",
    "issue:manage",
    "work_program:read",
    "work_program:execute",
    "qa_assessment:read",
    "audit_universe:read",
    "audit_universe:manage",
    "dashboard:manager",
    "rbia:score_freeze",
    "action_point:manage",
  ],
  CAE: [
    "observation:read",
    "observation:approve",
    "observation:close_high_critical",
    "audit_plan:read",
    "audit_plan:manage",
    "compliance:read",
    "compliance:update",
    "compliance:mark_na",
    "report:read",
    "report:generate",
    "report:add_commentary",
    "audit_trail:read",
    "admin:manage_users",
    "admin:manage_roles",
    "admin:manage_settings",
    "ram:read",
    "ram:create",
    "ram:approve",
    "audit_execution:read",
    "audit_execution:manage_team",
    "audit_execution:create",
    "audit_execution:manage_sections",
    "examination:read",
    "compliance:ace_process",
    "report:approve",
    "template:manage",
    "calendar:manage",
    "risk_register:read",
    "risk_register:manage",
    "control_library:read",
    "control_library:manage",
    "issue:read",
    "issue:manage",
    "issue:accept_risk",
    "work_program:read",
    "qa_assessment:read",
    "qa_assessment:manage",
    "audit_universe:read",
    "audit_universe:manage",
    "dashboard:cae",
    "rbia:score_freeze",
    "action_point:manage",
  ],
  CCO: [
    "compliance:read",
    "compliance:update",
    "observation:read",
    "report:read",
    "dashboard:cco",
  ],
  CEO: [
    "dashboard:ceo",
    "report:read",
    "report:generate",
    "report:approve",
    "observation:read",
    "compliance:read",
    "compliance:acb_report",
    "audit_plan:read",
    "audit_execution:read",
    "examination:read",
    "ram:read",
    "risk_register:read",
    "control_library:read",
    "work_program:read",
    "issue:read",
    "concurrent_audit:read",
    "regulatory:read",
    "policy:read",
    "committee:read",
    "board:workspace",
    "board:agenda",
    "board:reporting",
    "risk_mis:read",
    "housekeeping:read",
    "qa_assessment:read",
    "audit_universe:read",
    "calendar:manage",
    "audit_trail:read",
  ],
  AUDITEE: ["observation:read"], // Limited to assigned observations only
  BOARD_OBSERVER: [], // Reserved — no permissions yet (DE9)
  LEAD_AUDITOR: [
    "observation:create",
    "observation:read",
    "compliance:read",
    "audit_plan:read",
    "audit_execution:read",
    "audit_execution:manage_team",
    "audit_execution:create",
    "audit_execution:manage_sections",
    "examination:respond",
    "examination:read",
    "ram:read",
    "work_program:read",
    "work_program:execute",
    "control_library:read",
    "issue:read",
    "issue:manage",
    "dashboard:auditor",
    "rbia:examine",
    "action_point:manage",
  ],
  FIELD_AUDITOR: [
    "observation:create",
    "observation:read",
    "compliance:read",
    "audit_plan:read",
    "audit_execution:read",
    "examination:respond",
    "examination:read",
    "ram:read",
    "work_program:read",
    "work_program:execute",
    "control_library:read",
    "issue:read",
    "dashboard:auditor",
    "rbia:examine",
  ],
  BRANCH_HEAD: [
    "observation:read",
    "compliance:read",
    "examination:read",
    "bh_certificate:sign",
    "compliance:branch_response",
    "action_point:bm_respond",
  ],
  ZONAL_AUDITOR: [
    "observation:read",
    "compliance:read",
    "compliance:zac_review",
    "audit_plan:read",
    "audit_execution:read",
    "examination:read",
    "risk_register:read",
    "issue:read",
    "dashboard:auditor",
  ],
  ACE_OFFICER: [
    "observation:read",
    "compliance:read",
    "compliance:ace_process",
    "issue:read",
    "issue:manage",
    "issue:accept_risk",
    "risk_register:read",
    "control_library:read",
    "qa_assessment:read",
    "qa_assessment:manage",
    "audit_universe:read",
    "dashboard:cae",
  ],
  CONCURRENT_AUDITOR: [
    "observation:create",
    "observation:read",
    "concurrent_audit:read",
    "concurrent_audit:execute",
    "compliance:read",
    "examination:respond",
    "examination:read",
    "dashboard:auditor",
  ],
  IS_AUDITOR: [
    "observation:create",
    "observation:read",
    "compliance:read",
    "audit_plan:read",
    "audit_execution:read",
    "examination:respond",
    "examination:read",
    "control_library:read",
    "work_program:read",
    "work_program:execute",
    "issue:read",
    "issue:manage",
    "is_audit:read",
    "is_audit:manage",
    "dashboard:auditor",
  ],
  RISK_HEAD: [
    "risk_register:read",
    "risk_register:manage",
    "risk_mis:read",
    "control_library:read",
    "control_library:manage",
    "issue:read",
    "issue:manage",
    "issue:accept_risk",
    "audit_universe:read",
    "compliance:read",
    "observation:read",
    "policy:read",
    "housekeeping:read",
    "dashboard:risk_head",
  ],
  ACB_MEMBER: [
    "board:workspace",
    "board:agenda",
    "observation:read",
    "compliance:read",
    "compliance:acb_report",
    "risk_register:read",
    "risk_mis:read",
    "issue:read",
    "report:read",
    "policy:read",
    "committee:read",
    "regulatory:read",
    "dashboard:ceo",
  ],
  SYSTEM_ADMIN: [
    "admin:system",
    "admin:manage_users",
    "admin:manage_roles",
    "admin:manage_settings",
    "template:manage",
    "calendar:manage",
    "audit_universe:read",
    "audit_universe:manage",
    "policy:manage",
    "committee:manage",
    "dashboard:cae",
  ],
};

/**
 * Check if user with given roles has a specific permission.
 *
 * IMPORTANT (Decision D20): Uses roles.some() to check across ALL held roles.
 * NEVER use roles[0] or assume single role.
 *
 * Multi-role example:
 * - User with roles [CAE, CCO] checking 'dashboard:ceo' → false
 * - User with roles [CAE, CCO] checking 'audit_trail:read' → true (from CAE)
 * - User with roles [CAE, CCO] checking 'compliance:update' → true (from either)
 *
 * @param roles - Array of roles held by the user
 * @param permission - Permission to check
 * @returns true if any of the user's roles has the permission
 */
export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

/**
 * Get all permissions for a set of roles (union).
 *
 * For multi-role users, this returns the union of permissions from all roles.
 * Example: [CAE, CCO] → permissions from both roles combined.
 *
 * @param roles - Array of roles held by the user
 * @returns Array of all permissions across all roles (deduplicated)
 */
export function getPermissions(roles: Role[]): Permission[] {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(perm);
    }
  }
  return Array.from(permissions);
}

/**
 * Maker-checker enforcement.
 *
 * The same person cannot create AND approve the same observation.
 * This is a transaction-level check, not a role-level check.
 *
 * This prevents a single person from bypassing review by:
 * 1. Creating an observation
 * 2. Approving their own observation
 *
 * @param userId - ID of the user attempting approval
 * @param observation - Observation object with createdById field
 * @returns true if user can approve (not the creator)
 */
export function canApproveObservation(
  userId: string,
  observation: { createdById: string },
): boolean {
  return userId !== observation.createdById;
}

/**
 * Get all available roles (for admin dropdowns, etc.)
 * Excludes BOARD_OBSERVER which is reserved and not assignable yet.
 */
export function getAssignableRoles(): Role[] {
  return [
    Role.AUDITOR,
    Role.AUDIT_MANAGER,
    Role.CAE,
    Role.CCO,
    Role.CEO,
    Role.AUDITEE,
    Role.LEAD_AUDITOR,
    Role.FIELD_AUDITOR,
    Role.BRANCH_HEAD,
    Role.ZONAL_AUDITOR,
    Role.ACE_OFFICER,
    Role.CONCURRENT_AUDITOR,
    Role.IS_AUDITOR,
    Role.RISK_HEAD,
    Role.ACB_MEMBER,
    Role.SYSTEM_ADMIN,
  ];
}

/**
 * Get display name for a role.
 * Useful for UI labels, badges, etc.
 */
export function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    AUDITOR: "Auditor",
    AUDIT_MANAGER: "Audit Manager",
    CAE: "Head of Internal Audit (HIA)",
    CCO: "Chief Compliance Officer",
    CEO: "Chief Executive Officer",
    AUDITEE: "Auditee",
    BOARD_OBSERVER: "Board Observer",
    LEAD_AUDITOR: "Lead Auditor",
    FIELD_AUDITOR: "Field Auditor",
    BRANCH_HEAD: "Branch Head",
    ZONAL_AUDITOR: "Zonal Auditor",
    ACE_OFFICER: "ACE Officer",
    CONCURRENT_AUDITOR: "Concurrent Auditor",
    IS_AUDITOR: "IS/EDP Auditor",
    RISK_HEAD: "Risk Head",
    ACB_MEMBER: "ACB Member",
    SYSTEM_ADMIN: "System Admin",
  };
  return displayNames[role] || role;
}
