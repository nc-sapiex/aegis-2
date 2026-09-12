"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { Calendar } from "@/lib/icons";
import type { RegulatoryCalendarItem } from "@/data-access/dashboard";

// ─── Urgency Colors ─────────────────────────────────────────────────────────

function getUrgencyColor(dateStr: string): {
  dot: string;
  text: string;
  label: string;
} {
  const now = new Date();
  const deadline = new Date(dateStr);
  const diffDays = Math.ceil(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 7) {
    return {
      dot: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
      label: `${diffDays <= 0 ? "Overdue" : `${diffDays}d left`}`,
    };
  }
  if (diffDays <= 30) {
    return {
      dot: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      label: `${diffDays}d left`,
    };
  }
  return {
    dot: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    label: `${diffDays}d left`,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface RegulatoryCalendarWidgetProps {
  deadlines: RegulatoryCalendarItem[];
}

export function RegulatoryCalendarWidget({
  deadlines,
}: RegulatoryCalendarWidgetProps) {
  if (deadlines.length === 0) {
    return (
      <EmptyStateCard
        title="No Upcoming Deadlines"
        message="No compliance deadlines in the next 30 days."
        icon={<Calendar className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4" />
          Regulatory Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {deadlines.map((item) => {
            const urgency = getUrgencyColor(item.nextReviewDate);
            return (
              <li key={item.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${urgency.dot}`} />
                  <div className="bg-border mt-1 h-full w-px" />
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {item.requirement}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-medium ${urgency.text}`}
                    >
                      {urgency.label}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex gap-2 text-xs">
                    <span>{item.category}</span>
                    <span>
                      {new Date(item.nextReviewDate).toLocaleDateString(
                        "en-IN",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
