import { requireAnyPermission } from "@/lib/guards";
import { getDashboardConfig } from "@/lib/dashboard-config";
import { getDashboardData, type DashboardData } from "@/data-access/dashboard";
import { DashboardComposer } from "@/components/dashboard/dashboard-composer";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import type { Permission, Role } from "@/lib/permissions";

const DASHBOARD_PERMISSIONS: Permission[] = [
  "dashboard:auditor",
  "dashboard:manager",
  "dashboard:cae",
  "dashboard:cco",
  "dashboard:ceo",
];

/**
 * Dashboard Page — Server Component
 *
 * 1. Enforces dashboard permission (any role with dashboard access)
 * 2. Gets user roles, resolves widget config (multi-role dedup via getDashboardConfig)
 * 3. Pre-fetches all widget data for SSR (zero loading flash)
 * 4. Passes config + data to DashboardComposer client component
 */
export default async function DashboardPage() {
  const session = await requireAnyPermission(DASHBOARD_PERMISSIONS);

  const roles = session.user.roles;
  const widgetConfig = getDashboardConfig(roles);

  // Edge case: no widgets for user's role(s)
  if (widgetConfig.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <EmptyStateCard
          title="No dashboard configured"
          message="Your role does not have a dashboard view configured. Contact your administrator."
        />
      </div>
    );
  }

  // Pre-fetch dashboard data for SSR (no loading flash on first render)
  const widgetIds = widgetConfig.map((w) => w.id);
  let initialData: DashboardData = {};

  try {
    initialData = await getDashboardData(session, widgetIds);
  } catch (error) {
    // If data fetch fails, still render — individual widgets show error states
    console.error("Dashboard SSR data fetch failed:", error);
  }

  return (
    <DashboardComposer
      widgetConfig={widgetConfig}
      initialData={initialData}
      roles={roles}
    />
  );
}
