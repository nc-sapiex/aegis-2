"use client";

import Link from "next/link";
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
import { CheckCircle2 } from "@/lib/icons";
import type { PendingReview } from "@/data-access/dashboard";

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

interface PendingReviewsTableProps {
  reviews: PendingReview[];
}

export function PendingReviewsTable({ reviews }: PendingReviewsTableProps) {
  if (reviews.length === 0) {
    return (
      <EmptyStateCard
        title="No Pending Reviews"
        message="All submitted observations have been reviewed."
        icon={<CheckCircle2 className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/findings">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.slice(0, 10).map((review) => (
              <TableRow key={review.id}>
                <TableCell className="max-w-[200px] truncate font-medium">
                  <Link
                    href={`/findings/${review.id}`}
                    className="hover:underline"
                  >
                    {review.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={SEVERITY_VARIANT[review.severity] ?? "outline"}
                  >
                    {review.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {review.assignedToName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {review.submittedAt
                    ? new Date(review.submittedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
