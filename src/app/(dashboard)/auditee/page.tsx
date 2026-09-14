import { requirePermission } from "@/lib/guards";
import { getObservationsForAuditee } from "@/data-access/auditee";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, FileText, CircleAlert } from "@/lib/icons";
import { OverdueBanner } from "@/components/auditee/overdue-banner";
import { ObservationList } from "@/components/auditee/observation-list";

export default async function AuditeePage() {
  const session = await requirePermission("observation:read");

  const { observations, nextCursor } = await getObservationsForAuditee(session);

  // Compute summary counts from fetched data
  const pendingResponse = observations.filter(
    (o: any) => o.status === "ISSUED",
  ).length;
  const awaitingReview = observations.filter(
    (o: any) => o.status === "RESPONSE",
  ).length;
  const overdueCount = observations.filter((o: any) => {
    const dueDate = o.responseDueDate ?? o.dueDate;
    if (!dueDate) return false;
    const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
    return (
      due.getTime() < Date.now() && !["CLOSED", "COMPLIANCE"].includes(o.status)
    );
  }).length;
  const total = observations.length;

  const summaryCards = [
    {
      label: "Pending Your Response",
      count: pendingResponse,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Awaiting Review",
      count: awaitingReview,
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Overdue",
      count: overdueCount,
      icon: CircleAlert,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Total Findings",
      count: total,
      icon: FileText,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Auditee Portal
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Respond to audit findings and track remediation
        </p>
      </div>

      <OverdueBanner overdueCount={overdueCount} />

      {/* Summary cards — 2 cols mobile, 4 cols sm+ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-2 p-3 md:gap-3 md:p-4">
              <div className={`rounded-lg p-1.5 md:p-2 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold md:text-xl">{s.count}</p>
                <p className="text-muted-foreground text-sm">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Observation list with filters and pagination */}
      <ObservationList observations={observations} nextCursor={nextCursor} />
    </div>
  );
}
