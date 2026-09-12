"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Shimmer card for KPI/metric cards (third width) */
export function CardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Shimmer area for chart widgets (half width) */
export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-48 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

/** Shimmer rows for table widgets (full width) */
export function TableSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Renders appropriate skeleton based on widget size */
export function DashboardSkeleton({
  size,
}: {
  size: "full" | "half" | "third";
}) {
  switch (size) {
    case "third":
      return <CardSkeleton />;
    case "half":
      return <ChartSkeleton />;
    case "full":
      return <TableSkeleton />;
  }
}
