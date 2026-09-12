"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type NpaQuarterData = {
  quarter: string;
  SMA0: number;
  SMA1: number;
  SMA2: number;
  NPA: number;
};

interface NpaWaterfallProps {
  data: NpaQuarterData[];
}

/**
 * NPA Movement Waterfall (R46)
 *
 * Displays SMA/NPA movement across quarters to track
 * asset quality deterioration patterns.
 */
export function NpaWaterfall({ data }: NpaWaterfallProps) {
  const totalAccounts = data.reduce(
    (sum, q) => sum + q.SMA0 + q.SMA1 + q.SMA2 + q.NPA,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>NPA Movement Waterfall</CardTitle>
        <CardDescription>
          SMA/NPA category movement across quarters — tracks asset quality
          deterioration
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            No SMA/NPA data available. Data is captured during loan review
            audits.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{totalAccounts} total entries</Badge>
              <Badge variant="outline">{data.length} quarters tracked</Badge>
            </div>

            {/* Waterfall table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quarter</TableHead>
                    <TableHead className="text-right">SMA-0</TableHead>
                    <TableHead className="text-right">SMA-1</TableHead>
                    <TableHead className="text-right">SMA-2</TableHead>
                    <TableHead className="text-right">NPA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const total = row.SMA0 + row.SMA1 + row.SMA2 + row.NPA;
                    return (
                      <TableRow key={row.quarter}>
                        <TableCell className="font-medium">
                          {row.quarter}
                        </TableCell>
                        <TableCell className="text-right">{row.SMA0}</TableCell>
                        <TableCell className="text-right text-amber-600">
                          {row.SMA1}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {row.SMA2}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {row.NPA}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {total}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
