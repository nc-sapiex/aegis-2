import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck } from "@/lib/icons";
import { getComplianceScorecard } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

const scorecard = getComplianceScorecard();

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function StackedBar({
  compliant,
  partial,
  nonCompliant,
  pending,
  total,
}: {
  compliant: number;
  partial: number;
  nonCompliant: number;
  pending: number;
  total: number;
}) {
  if (total === 0) return null;

  const segments = [
    { count: compliant, color: "bg-emerald-500", label: "Compliant" },
    { count: partial, color: "bg-amber-500", label: "Partial" },
    { count: nonCompliant, color: "bg-red-500", label: "Non-Compliant" },
    { count: pending, color: "bg-slate-300", label: "Pending" },
  ];

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`${compliant} compliant, ${partial} partial, ${nonCompliant} non-compliant, ${pending} pending`}
    >
      {segments.map(
        (seg) =>
          seg.count > 0 && (
            <div
              key={seg.label}
              className={cn(seg.color)}
              style={{ width: `${(seg.count / total) * 100}%` }}
              title={`${seg.label}: ${seg.count}`}
            />
          ),
      )}
    </div>
  );
}

export function ComplianceScorecard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Compliance Scorecard
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center gap-3 md:gap-4">
          <p
            className={cn(
              "text-3xl font-bold md:text-4xl",
              getScoreColor(scorecard.overallScore),
            )}
          >
            {scorecard.overallScore}%
          </p>
          <div>
            <p className="text-sm font-medium md:text-base">
              Overall Compliance Score
            </p>
            <p className="text-muted-foreground text-sm md:text-base">
              {scorecard.totalRequirements} total requirements assessed
            </p>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Compliant</TableHead>
                <TableHead className="text-right">Partial</TableHead>
                <TableHead className="text-right">Non-Compliant</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {scorecard.byCategory.map((cat) => (
                <TableRow key={cat.category}>
                  <TableCell className="font-medium">{cat.category}</TableCell>
                  <TableCell className="text-right">{cat.total}</TableCell>
                  <TableCell className="text-right">{cat.compliant}</TableCell>
                  <TableCell className="text-right">{cat.partial}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      cat.nonCompliant > 0 && "font-medium text-red-600",
                    )}
                  >
                    {cat.nonCompliant}
                  </TableCell>
                  <TableCell className="text-right">{cat.pending}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold",
                      getScoreColor(cat.score),
                    )}
                  >
                    {cat.score}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Visual Stacked Bars per Category */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm font-medium">
            Status Distribution by Category
          </p>
          {scorecard.byCategory.map((cat) => (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{cat.category}</span>
                <span className={cn("font-medium", getScoreColor(cat.score))}>
                  {cat.score}%
                </span>
              </div>
              <StackedBar
                compliant={cat.compliant}
                partial={cat.partial}
                nonCompliant={cat.nonCompliant}
                pending={cat.pending}
                total={cat.total}
              />
            </div>
          ))}

          {/* Legend */}
          <div className="text-muted-foreground flex flex-wrap gap-4 pt-2 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Compliant
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Partial
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Non-Compliant
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              Pending
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
