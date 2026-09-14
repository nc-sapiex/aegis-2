import {
  getObservationSummary,
  getObservations,
} from "@/data-access/observations";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FindingsTable } from "@/components/findings/findings-table";
import {
  CircleAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Download,
} from "@/lib/icons";
import Link from "next/link";
import { requirePermission } from "@/lib/guards";
import { isBranchScopedObservationReader } from "@/lib/access-scope";
import { redirect } from "next/navigation";

export default async function FindingsPage() {
  const session = await requirePermission("observation:read");
  if (isBranchScopedObservationReader(session.user.roles)) {
    redirect("/auditee");
  }

  const [summary, observationsData] = await Promise.all([
    getObservationSummary(session),
    getObservations(session),
  ]);
  const observations = observationsData.observations;

  const severityCards = [
    {
      label: "Critical",
      count: summary.bySeverity.CRITICAL ?? summary.bySeverity.critical ?? 0,
      icon: CircleAlert,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "High",
      count: summary.bySeverity.HIGH ?? summary.bySeverity.high ?? 0,
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Medium",
      count: summary.bySeverity.MEDIUM ?? summary.bySeverity.medium ?? 0,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "Low",
      count: summary.bySeverity.LOW ?? summary.bySeverity.low ?? 0,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Audit Findings
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {`${summary.total} findings across all audits`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/api/exports/findings" download>
              <Download className="mr-1 h-4 w-4" />
              Export
            </a>
          </Button>
          <Button asChild>
            <Link href="/findings/new">
              <Plus className="mr-1 h-4 w-4" />
              Create Observation
            </Link>
          </Button>
        </div>
      </div>

      {/* Severity distribution — 2 cols mobile, 4 cols sm+ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {severityCards.map((s) => (
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

      {/* Findings table with sorting, filtering, and row navigation */}
      {/* TODO: Add pagination for tables with >20 rows */}
      <FindingsTable observations={observations} />
    </div>
  );
}
