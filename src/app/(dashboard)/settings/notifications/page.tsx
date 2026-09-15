import { getNotificationPreferences } from "@/data-access/notifications";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { requireAnyPermission } from "@/lib/guards";
import { DASHBOARD_PERMISSIONS } from "@/lib/access-scope";

const REGULATORY_ROLES = [
  "CAE",
  "CCO",
  "CHIEF_AUDIT_EXECUTIVE",
  "CHIEF_COMPLIANCE_OFFICER",
];

export default async function NotificationPreferencesPage() {
  // Personal settings page — open to any real user, not gated behind a
  // single business permission. Every role holds a dashboard:* permission
  // except AUDITEE and BRANCH_HEAD, which hold observation:read instead —
  // together these cover every assignable role (see getAssignableRoles()).
  const session = await requireAnyPermission([
    ...DASHBOARD_PERMISSIONS,
    "observation:read",
  ]);
  const prefs = await getNotificationPreferences(session);
  const userRoles = session.user.roles;
  const isRegulatoryRole = userRoles.some((r) => REGULATORY_ROLES.includes(r));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Notification Preferences
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Manage how and when you receive email notifications.
        </p>
      </div>

      <NotificationPreferencesForm
        initialPreferences={{
          emailEnabled: prefs.emailEnabled,
          digestPreference: prefs.digestPreference,
        }}
        isRegulatoryRole={isRegulatoryRole}
      />
    </div>
  );
}
