"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/lib/icons";
import { ObservationCard, type AuditeeObservation } from "./observation-card";

interface ObservationListProps {
  observations: AuditeeObservation[];
  nextCursor?: string | null;
  loadMore?: (cursor: string) => Promise<{
    observations: AuditeeObservation[];
    nextCursor: string | null;
  }>;
}

type SortOption = "deadline" | "severity" | "created";

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  critical: 0,
  HIGH: 1,
  high: 1,
  MEDIUM: 2,
  medium: 2,
  LOW: 3,
  low: 3,
};

function sortObservations(
  observations: AuditeeObservation[],
  sortBy: SortOption,
): AuditeeObservation[] {
  return [...observations].sort((a, b) => {
    switch (sortBy) {
      case "deadline": {
        const dateA = a.responseDueDate ?? a.dueDate;
        const dateB = b.responseDueDate ?? b.dueDate;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        const tA =
          typeof dateA === "string"
            ? new Date(dateA).getTime()
            : dateA.getTime();
        const tB =
          typeof dateB === "string"
            ? new Date(dateB).getTime()
            : dateB.getTime();
        return tA - tB;
      }
      case "severity": {
        const sA = SEVERITY_ORDER[a.severity] ?? 99;
        const sB = SEVERITY_ORDER[b.severity] ?? 99;
        return sA - sB;
      }
      case "created": {
        // Observations don't have createdAt in props yet, fall back to id order
        return 0;
      }
      default:
        return 0;
    }
  });
}

function filterByTab(
  observations: AuditeeObservation[],
  tab: string,
): AuditeeObservation[] {
  switch (tab) {
    case "pending":
      return observations.filter((o) => o.status.toUpperCase() === "ISSUED");
    case "awaiting":
      return observations.filter((o) => o.status.toUpperCase() === "RESPONSE");
    case "closed":
      return observations.filter((o) => o.status.toUpperCase() === "CLOSED");
    default:
      return observations;
  }
}

export function ObservationList({
  observations: initialObservations,
  nextCursor: initialCursor,
  loadMore,
}: ObservationListProps) {
  const [observations, setObservations] = React.useState(initialObservations);
  const [cursor, setCursor] = React.useState(initialCursor ?? null);
  const [loading, setLoading] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>("deadline");

  const handleLoadMore = async () => {
    if (!cursor || !loadMore) return;
    setLoading(true);
    try {
      const result = await loadMore(cursor);
      setObservations((prev) => [...prev, ...result.observations]);
      setCursor(result.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  const emptyMessage = (tab: string) => {
    switch (tab) {
      case "pending":
        return "No observations pending your response.";
      case "awaiting":
        return "No observations awaiting review.";
      case "closed":
        return "No closed observations.";
      default:
        return "No observations found.";
    }
  };

  const renderList = (tab: string) => {
    const filtered = filterByTab(observations, tab);
    const sorted = sortObservations(filtered, sortBy);

    if (sorted.length === 0) {
      return (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {emptyMessage(tab)}
        </p>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((obs) => (
          <ObservationCard key={obs.id} observation={obs} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs defaultValue="all" className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending Response</TabsTrigger>
              <TabsTrigger value="awaiting">Awaiting Review</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">By Deadline</SelectItem>
                <SelectItem value="severity">By Severity</SelectItem>
                <SelectItem value="created">By Date Created</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="all">{renderList("all")}</TabsContent>
          <TabsContent value="pending">{renderList("pending")}</TabsContent>
          <TabsContent value="awaiting">{renderList("awaiting")}</TabsContent>
          <TabsContent value="closed">{renderList("closed")}</TabsContent>
        </Tabs>
      </div>

      {cursor && loadMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
