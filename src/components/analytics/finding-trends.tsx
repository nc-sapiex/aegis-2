"use client";

import * as React from "react";
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
import { TrendingUp } from "@/lib/icons";

interface FindingTrendsProps {
  data: Array<{
    quarter: string;
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    total: number;
  }>;
}

export function FindingTrends({ data }: FindingTrendsProps) {
  // Get trend for latest 2 quarters
  const latestTotal = data.length > 0 ? data[data.length - 1].total : 0;
  const previousTotal = data.length > 1 ? data[data.length - 2].total : 0;
  const trend = latestTotal - previousTotal;
  const trendPercent =
    previousTotal > 0 ? Math.round((trend / previousTotal) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="text-primary h-5 w-5" />
          <CardTitle>Finding Trends</CardTitle>
        </div>
        <CardDescription>
          Quarterly trends of observations by severity
        </CardDescription>
        {data.length >= 2 && (
          <p className="text-muted-foreground pt-2 text-sm">
            Latest quarter: {latestTotal} findings
            {trend !== 0 && (
              <span
                className={
                  trend > 0
                    ? "ml-2 font-semibold text-red-600"
                    : "ml-2 font-semibold text-green-600"
                }
              >
                ({trend > 0 ? "+" : ""}
                {trend}, {trendPercent}%)
              </span>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead className="text-right">Critical</TableHead>
                <TableHead className="text-right">High</TableHead>
                <TableHead className="text-right">Medium</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No finding data available.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.quarter}>
                    <TableCell className="font-medium">{row.quarter}</TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-red-600">
                        {row.CRITICAL}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-orange-600">
                        {row.HIGH}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-yellow-600">
                        {row.MEDIUM}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-green-600">
                        {row.LOW}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {row.total}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
