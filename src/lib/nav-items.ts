import {
  LayoutDashboard,
  ShieldCheck,
  Shield,
  ClipboardList,
  ClipboardCheck,
  Search,
  FileBarChart,
  FileText,
  UserCheck,
  Settings,
  Users,
  Clock,
  Gauge,
  Activity,
  BarChart3,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Building2,
  TrendingUp,
  Monitor,
  LayoutGrid,
} from "@/lib/icons";
import type { Permission, Role } from "./permissions";
import {
  DASHBOARD_PERMISSIONS,
  isBranchScopedObservationReader,
} from "./access-scope";

/**
 * Navigation item structure for sidebar.
 */
export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission: Permission;
}

/**
 * All navigation items with their required permissions.
 *
 * Dashboard permissions are role-specific:
 * - dashboard:auditor → Auditors see auditor-specific dashboard
 * - dashboard:manager → Audit managers see manager-specific dashboard
 * - dashboard:cae → CAE sees CAE-specific dashboard
 * - dashboard:cco → CCO sees CCO-specific dashboard
 * - dashboard:ceo → CEO sees CEO-specific dashboard
 */
export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    requiredPermission: "dashboard:auditor", // Fallback, will be dynamically replaced
  },
  {
    title: "Compliance",
    href: "/compliance",
    icon: Shield,
    requiredPermission: "compliance:read",
  },
  {
    title: "Audit Planning",
    href: "/audit-plans",
    icon: ClipboardList,
    requiredPermission: "audit_plan:read",
  },
  {
    title: "Findings",
    href: "/findings",
    icon: Search,
    requiredPermission: "observation:read",
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    requiredPermission: "dashboard:cae", // CAE or CEO
  },
  {
    title: "Calendar",
    href: "/calendar",
    icon: Calendar,
    requiredPermission: "calendar:manage",
  },
  {
    title: "Reports",
    href: "/reports",
    icon: FileText,
    requiredPermission: "report:read",
  },
  {
    title: "Auditee Portal",
    href: "/auditee",
    icon: UserCheck,
    requiredPermission: "observation:read", // Auditees can read their assigned observations
  },
  {
    title: "RAM Assessments",
    href: "/ram",
    icon: Gauge,
    requiredPermission: "ram:read",
  },
  {
    title: "Audit Execution",
    href: "/audit-execution",
    icon: Activity,
    requiredPermission: "audit_execution:read",
  },
  {
    title: "Audit Trail",
    href: "/audit-trail",
    icon: Clock,
    requiredPermission: "audit_trail:read",
  },
  {
    title: "Admin",
    href: "/admin",
    icon: Users,
    requiredPermission: "admin:manage_users",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    requiredPermission: "admin:manage_settings",
  },
  {
    title: "Modules",
    href: "/settings/modules",
    icon: LayoutGrid,
    requiredPermission: "module:manage",
  },
];

/**
 * Filter navigation items by user's roles.
 *
 * Returns union of all nav items that the user has permission to access.
 * For multi-role users, they see all items from all their roles.
 *
 * Example:
 * - User with [CAE] → sees admin, audit trail, reports, etc.
 * - User with [AUDITOR, AUDIT_MANAGER] → sees both auditor and manager nav items
 * - User with [BOARD_OBSERVER] → sees nothing (empty permissions, graceful handling)
 *
 * @param roles - Array of roles held by the user
 * @returns Filtered array of nav items user can access
 */
export function filterNavByRoles(roles: Role[]): NavItem[] {
  const permissions = new Set<Permission>();

  // Collect all permissions from all user's roles
  for (const role of roles) {
    for (const perm of getPermissionsForRole(role)) {
      permissions.add(perm);
    }
  }

  // Filter nav items: user needs at least one permission that matches nav item's requirement
  return navItems.filter((item) => {
    // Special case: Dashboard has multiple role-specific permissions
    if (item.title === "Dashboard") {
      return DASHBOARD_PERMISSIONS.some((permission) =>
        permissions.has(permission),
      );
    }

    // AUDITEE / BRANCH_HEAD use the auditee portal. The Findings list is
    // tenant-wide and must not appear for branch-scoped readers.
    if (item.title === "Findings") {
      return (
        permissions.has("observation:read") &&
        !isBranchScopedObservationReader(roles)
      );
    }

    // Special case: Analytics accessible by CAE, CEO, or RISK_HEAD
    if (item.title === "Analytics") {
      return (
        permissions.has("dashboard:cae") ||
        permissions.has("dashboard:ceo") ||
        permissions.has("dashboard:risk_head")
      );
    }

    return permissions.has(item.requiredPermission);
  });
}

/**
 * Get all permissions for a specific role.
 * Helper for filterNavByRoles.
 *
 * Note: In production, this should import from permissions.ts's ROLE_PERMISSIONS
 * to avoid duplication. For now, defined inline to avoid circular import.
 */
function getPermissionsForRole(role: Role): Permission[] {
  const rolePermissions: Record<Role, Permission[]> = {
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
      "dashboard:manager",
      "module:manage",
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
      "calendar:manage",
      "dashboard:cae",
      "module:manage",
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
      "observation:read",
      "compliance:read",
    ],
    AUDITEE: ["observation:read"],
    BOARD_OBSERVER: [],
    LEAD_AUDITOR: [
      "observation:create",
      "observation:read",
      "compliance:read",
      "audit_plan:read",
      "audit_execution:read",
      "audit_execution:manage_team",
      "audit_execution:manage_sections",
      "examination:respond",
      "examination:read",
      "ram:read",
      "dashboard:auditor",
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
      "dashboard:auditor",
    ],
    BRANCH_HEAD: [
      "observation:read",
      "compliance:read",
      "examination:read",
      "bh_certificate:sign",
      "compliance:branch_response",
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
      "module:manage",
    ],
  };

  return rolePermissions[role] || [];
}
