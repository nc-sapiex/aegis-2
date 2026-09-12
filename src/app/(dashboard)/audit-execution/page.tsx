import {
  getEngagements,
  getEngagementSummary,
} from "@/data-access/audit-execution";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EngagementsTable } from "@/components/audit-execution/engagements-table";
import {
  ClipboardList,
  Activity,
  CheckCircle2,
  XCircle,
  Plus,
} from "@/lib/icons";
import Link from "next/link";
import { requirePermission } from "@/lib/guards";

export default async function AuditExecutionPage() {
  const session = await requirePermission("audit_execution:read");

  const [summary, engagements] = await Promise.all([
    getEngagementSummary(session),
    getEngagements(session),
  ]);

  const statusCards = [
    {
      label: "Planned",
      count: summary.PLANNED,
      icon: ClipboardList,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "In Progress",
      count: summary.IN_PROGRESS,
      icon: Activity,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "Completed",
      count: summary.COMPLETED,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Cancelled",
      count: summary.CANCELLED,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Audit Execution
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {summary.total} engagement{summary.total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button asChild>
          <Link href="/audit-execution/create">
            <Plus className="mr-1 h-4 w-4" />
            Create Engagement
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statusCards.map((s) => (
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

      {/* TODO: Add pagination for tables with >20 rows */}
      <EngagementsTable engagements={engagements} />
    </div>
  );
}
