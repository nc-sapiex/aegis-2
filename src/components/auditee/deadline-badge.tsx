"use client";

import { Badge } from "@/components/ui/badge";
import { Clock } from "@/lib/icons";

interface DeadlineBadgeProps {
  dueDate: Date | string | null;
}

function getDaysRemaining(dueDate: Date | string): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  // Reset to start of day for consistent day calculation
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function DeadlineBadge({ dueDate }: DeadlineBadgeProps) {
  if (!dueDate) {
    return <span className="text-muted-foreground text-xs">No deadline</span>;
  }

  const days = getDaysRemaining(dueDate);

  // Overdue
  if (days < 0) {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-100 text-red-800"
      >
        <Clock className="mr-1 h-3 w-3" />
        {Math.abs(days)}d overdue
      </Badge>
    );
  }

  // Due today
  if (days === 0) {
    return (
      <Badge
        variant="outline"
        className="animate-pulse border-red-200 bg-red-100 text-red-800"
      >
        <Clock className="mr-1 h-3 w-3" />
        Due today
      </Badge>
    );
  }

  // Due tomorrow
  if (days === 1) {
    return (
      <Badge
        variant="outline"
        className="animate-pulse border-red-200 bg-red-100 text-red-800"
      >
        <Clock className="mr-1 h-3 w-3" />
        Due tomorrow
      </Badge>
    );
  }

  // 1-3 days
  if (days <= 3) {
    return (
      <Badge
        variant="outline"
        className="border-orange-200 bg-orange-100 text-orange-800"
      >
        <Clock className="mr-1 h-3 w-3" />
        {days}d remaining
      </Badge>
    );
  }

  // 3-7 days
  if (days <= 7) {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-100 text-amber-800"
      >
        <Clock className="mr-1 h-3 w-3" />
        {days}d remaining
      </Badge>
    );
  }

  // > 7 days
  return (
    <span className="text-muted-foreground text-xs">{days}d remaining</span>
  );
}
