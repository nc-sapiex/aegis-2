import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioStatsProps {
  totalAccounts: number;
  totalSanction: number;
  totalOutstanding: number;
  byAssetClass: {
    assetClass: string;
    count: number;
    sanction: number;
    outstanding: number;
  }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Summary stats cards for the uploaded loan portfolio.
 *
 * Shows Total Accounts, Total Sanction, Total Outstanding in a 3-column grid.
 * If data is present, also shows an asset class breakdown table below.
 */
export function PortfolioStats({
  totalAccounts,
  totalSanction,
  totalOutstanding,
  byAssetClass,
}: PortfolioStatsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAccounts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Sanction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{(totalSanction / 100000).toFixed(2)}L
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{(totalOutstanding / 100000).toFixed(2)}L
            </div>
          </CardContent>
        </Card>
      </div>

      {totalAccounts > 0 && byAssetClass.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Class</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Sanction (₹L)</TableHead>
                <TableHead className="text-right">Outstanding (₹L)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAssetClass.map((row) => (
                <TableRow key={row.assetClass}>
                  <TableCell className="font-medium">
                    {row.assetClass}
                  </TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right">
                    {(row.sanction / 100000).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(row.outstanding / 100000).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
