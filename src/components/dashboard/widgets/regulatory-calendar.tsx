"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Calendar, CheckCircle2 } from "@/lib/icons";
import type { RegulatoryCalendarItem } from "@/data-access/dashboard";

// ─── Urgency Helpers ────────────────────────────────────────────────────────

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyClass(daysUntil: number): string {
  if (daysUntil <= 0)
    return "border-l-red-600 bg-red-50 dark:border-l-red-400 dark:bg-red-950/20";
  if (daysUntil <= 7)
    return "border-l-red-500 bg-red-50/50 dark:border-l-red-400 dark:bg-red-950/10";
  if (daysUntil <= 30)
    return "border-l-amber-500 bg-amber-50/50 dark:border-l-amber-400 dark:bg-amber-950/10";
  return "border-l-green-500 bg-green-50/50 dark:border-l-green-400 dark:bg-green-950/10";
}

function getUrgencyLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "Overdue";
  if (daysUntil === 1) return "Tomorrow";
  return `${daysUntil}d`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface RegulatoryCalendarProps {
  deadlines: RegulatoryCalendarItem[];
}

export function RegulatoryCalendar({ deadlines }: RegulatoryCalendarProps) {
  if (deadlines.length === 0) {
    return (
      <EmptyStateCard
        title="No Upcoming Deadlines"
        message="All compliance reviews are up to date."
        icon={<CheckCircle2 className="h-8 w-8" />}
      />
    );
  }

  const sorted = [...deadlines].sort(
    (a, b) =>
      new Date(a.nextReviewDate).getTime() -
      new Date(b.nextReviewDate).getTime(),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4" />
          Regulatory Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {sorted.map((item) => {
            const daysUntil = getDaysUntil(item.nextReviewDate);
            return (
              <li
                key={item.id}
                className={`rounded border-l-4 px-3 py-2 ${getUrgencyClass(daysUntil)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {item.requirement}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      daysUntil <= 7
                        ? "text-red-600 dark:text-red-400"
                        : daysUntil <= 30
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {getUrgencyLabel(daysUntil)}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                  <span>{item.category}</span>
                  <span>·</span>
                  <span>
                    {new Date(item.nextReviewDate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
