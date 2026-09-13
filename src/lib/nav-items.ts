import {
  LayoutDashboard,
  Shield,
  ClipboardList,
  Search,
  FileText,
  UserCheck,
  Settings,
  Users,
  Clock,
  Gauge,
  Activity,
  BarChart3,
  Calendar,
} from "@/lib/icons";
import {
  getPermissions,
  type Permission,
  type Role,
} from "./permissions";

/**
 * Navigation item structure for sidebar.
 */
export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tKey: string;
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
    tKey: "dashboard",
    requiredPermission: "dashboard:auditor", // Fallback, will be dynamically replaced
  },
  {
    title: "Compliance",
    href: "/compliance",
    icon: Shield,
    tKey: "compliance",
    requiredPermission: "compliance:read",
  },
  {
    title: "Audit Planning",
    href: "/audit-plans",
    icon: ClipboardList,
    tKey: "auditPlanning",
    requiredPermission: "audit_plan:read",
  },
  {
    title: "Findings",
    href: "/findings",
    icon: Search,
    tKey: "findings",
    requiredPermission: "observation:read",
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    tKey: "analytics",
    requiredPermission: "dashboard:cae", // CAE or CEO
  },
  {
    title: "Calendar",
    href: "/calendar",
    icon: Calendar,
    tKey: "calendar",
    requiredPermission: "calendar:manage",
  },
  {
    title: "Reports",
    href: "/reports",
    icon: FileText,
    tKey: "reports",
    requiredPermission: "report:read",
  },
  {
    title: "Auditee Portal",
    href: "/auditee",
    icon: UserCheck,
    tKey: "auditeePortal",
    requiredPermission: "observation:read", // Auditees can read their assigned observations
  },
  {
    title: "RAM Assessments",
    href: "/ram",
    icon: Gauge,
    tKey: "ramAssessments",
    requiredPermission: "ram:read",
  },
  {
    title: "Audit Execution",
    href: "/audit-execution",
    icon: Activity,
    tKey: "auditExecution",
    requiredPermission: "audit_execution:read",
  },
  {
    title: "Audit Trail",
    href: "/audit-trail",
    icon: Clock,
    tKey: "auditTrail",
    requiredPermission: "audit_trail:read",
  },
  {
    title: "Admin",
    href: "/admin",
    icon: Users,
    tKey: "admin",
    requiredPermission: "admin:manage_users",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    tKey: "settings",
    requiredPermission: "admin:manage_settings",
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
 * - User with [BOARD_OBSERVER] → sees dashboard, findings, and reports
 *
 * @param roles - Array of roles held by the user
 * @returns Filtered array of nav items user can access
 */
export function filterNavByRoles(roles: Role[]): NavItem[] {
  const permissions = new Set<Permission>(getPermissions(roles));

  // Filter nav items: user needs at least one permission that matches nav item's requirement
  return navItems.filter((item) => {
    // Special case: Dashboard has multiple role-specific permissions
    if (item.title === "Dashboard") {
      return (
        permissions.has("dashboard:auditor") ||
        permissions.has("dashboard:manager") ||
        permissions.has("dashboard:cae") ||
        permissions.has("dashboard:cco") ||
        permissions.has("dashboard:ceo") ||
        permissions.has("dashboard:risk_head")
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

    if (item.title === "Auditee Portal") {
      return roles.includes("AUDITEE");
    }

    return permissions.has(item.requiredPermission);
  });
}
