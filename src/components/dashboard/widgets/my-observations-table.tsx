"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Eye, ArrowUpDown } from "@/lib/icons";
import type { AssignedObservation } from "@/data-access/dashboard";

// ─── Severity Badge Colors ──────────────────────────────────────────────────

const SEVERITY_VARIANT: Record<
  string,
  "destructive" | "default" | "secondary" | "outline"
> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

// ─── Component ──────────────────────────────────────────────────────────────

interface MyObservationsTableProps {
  observations: AssignedObservation[];
}

type SortField = "severity" | "dueDate";

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function MyObservationsTable({
  observations,
}: MyObservationsTableProps) {
  const [sortBy, setSortBy] = useState<SortField>("dueDate");

  if (observations.length === 0) {
    return (
      <EmptyStateCard
        title="No Observations"
        message="No observations are currently assigned to you."
        icon={<Eye className="h-8 w-8" />}
      />
    );
  }

  const sorted = [...observations].sort((a, b) => {
    if (sortBy === "severity") {
      return (
        (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
      );
    }
    // Sort by dueDate — nulls last, overdue first
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">My Observations</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/findings">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-1"
                  onClick={() => setSortBy("severity")}
                >
                  Severity
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-1"
                  onClick={() => setSortBy("dueDate")}
                >
                  Due Date
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.slice(0, 10).map((obs) => (
              <TableRow key={obs.id}>
                <TableCell className="max-w-[200px] truncate font-medium">
                  <Link
                    href={`/findings/${obs.id}`}
                    className="hover:underline"
                  >
                    {obs.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={SEVERITY_VARIANT[obs.severity] ?? "outline"}>
                    {obs.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {obs.branchName ?? "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      obs.isOverdue
                        ? "font-medium text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }
                  >
                    {obs.dueDate
                      ? new Date(obs.dueDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
