"use client";

import { Clock, AlertTriangle } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";

interface BmDeadlineBannerProps {
  deadline: Date | string;
  status: string;
}

/**
 * Persistent deadline countdown banner with urgency color coding.
 *
 * Color thresholds per CONTEXT.md locked decision:
 * - Green:  > 7 days remaining
 * - Amber:  3-7 days remaining
 * - Red:    < 48 hours (< 2 days) remaining
 * - Red + OVERDUE badge:  status === "OVERDUE" or deadline has passed
 */
export function BmDeadlineBanner({ deadline, status }: BmDeadlineBannerProps) {
  const deadlineDate = new Date(deadline);
  const daysRemaining = Math.ceil(
    (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const isOverdue = status === "OVERDUE" || daysRemaining < 0;

  // Determine urgency tier
  let bgColor: string;
  let borderColor: string;
  let textColor: string;
  let Icon = Clock;

  if (isOverdue) {
    bgColor = "bg-red-50";
    borderColor = "border-red-200";
    textColor = "text-red-800";
    Icon = AlertTriangle;
  } else if (daysRemaining < 2) {
    // < 48 hours
    bgColor = "bg-red-50";
    borderColor = "border-red-200";
    textColor = "text-red-800";
    Icon = AlertTriangle;
  } else if (daysRemaining <= 7) {
    // 3-7 days
    bgColor = "bg-amber-50";
    borderColor = "border-amber-200";
    textColor = "text-amber-800";
  } else {
    // > 7 days
    bgColor = "bg-green-50";
    borderColor = "border-green-200";
    textColor = "text-green-800";
  }

  return (
    <div
      className={`sticky top-0 z-10 flex items-center gap-3 rounded-lg border px-4 py-3 ${bgColor} ${borderColor} ${textColor}`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <div className="flex flex-1 items-center gap-2">
        {isOverdue ? (
          <>
            <span className="text-sm font-medium">
              OVERDUE &mdash; response deadline has passed
            </span>
            <Badge className="border-red-300 bg-red-100 text-red-700">
              OVERDUE
            </Badge>
          </>
        ) : (
          <span className="text-sm font-medium">
            {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining to
            submit responses
          </span>
        )}
      </div>
      <span className="text-xs opacity-75">
        Due: {deadlineDate.toLocaleDateString("en-IN")}
      </span>
    </div>
  );
}
