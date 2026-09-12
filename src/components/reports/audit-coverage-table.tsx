import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuditCoverage } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

function getCompletionRateColor(rate: number): string {
  if (rate >= 100) return "text-emerald-600 font-semibold";
  if (rate >= 50) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

export function AuditCoverageTable() {
  const rows = getAuditCoverage();

  // Calculate totals
  const totals = rows.reduce(
    (acc, row) => ({
      planned: acc.planned + row.planned,
      completed: acc.completed + row.completed,
      inProgress: acc.inProgress + row.inProgress,
    }),
    { planned: 0, completed: 0, inProgress: 0 },
  );

  const totalCompletionRate =
    totals.planned > 0
      ? Math.round((totals.completed / totals.planned) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Audit Coverage &mdash; FY 2025-26
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Audit Type</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">In Progress</TableHead>
                <TableHead className="text-right">Completion Rate</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.type}>
                  <TableCell className="font-medium">{row.type}</TableCell>
                  <TableCell className="text-right">{row.planned}</TableCell>
                  <TableCell className="text-right">{row.completed}</TableCell>
                  <TableCell className="text-right">{row.inProgress}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      getCompletionRateColor(row.completionRate),
                    )}
                  >
                    {row.completionRate}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                <TableCell className="text-right font-bold">
                  {totals.planned}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {totals.completed}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {totals.inProgress}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right",
                    getCompletionRateColor(totalCompletionRate),
                  )}
                >
                  {totalCompletionRate}%
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
