import { requirePermission } from "@/lib/guards";
import { getAuditCalendarEvents } from "@/data-access/analytics";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage() {
  const session = await requirePermission("calendar:manage");
  const tenantId = session.user.tenantId;


  // Fetch calendar events for current fiscal year (April 1 – March 31)
  // Prevents unbounded query loading all historical events on every page visit
  const now = new Date();
  const currentYear = now.getFullYear();
  // Indian fiscal year: April = month 3 (0-indexed). Before April → previous FY.
  const fyYear = now.getMonth() < 3 ? currentYear - 1 : currentYear;
  const fiscalStart = new Date(fyYear, 3, 1); // April 1
  const fiscalEnd = new Date(fyYear + 1, 2, 31, 23, 59, 59); // March 31

  const events = await getAuditCalendarEvents(tenantId, fiscalStart, fiscalEnd);

  const canManage = true;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Audit Calendar
          </h1>
          <p className="text-muted-foreground">
            Schedule and track audit engagements, meetings, and important dates
          </p>
        </div>
      </div>

      <CalendarView events={events} canManage={canManage} />
    </div>
  );
}
