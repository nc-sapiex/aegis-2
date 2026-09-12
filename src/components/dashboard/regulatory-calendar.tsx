"use client";

import * as React from "react";
import { demoComplianceRequirements } from "@/data";
import type { ComplianceData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight } from "@/lib/icons";
import { formatDate } from "@/lib/utils";

const compData = demoComplianceRequirements as unknown as ComplianceData;

function getRelativeLabel(dueDate: string): {
  text: string;
  className: string;
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0)
    return {
      text: "Overdue",
      className: "text-red-600 dark:text-red-400 font-medium",
    };
  if (diffDays === 0)
    return {
      text: "Due today",
      className: "text-red-600 dark:text-red-400 font-medium",
    };
  if (diffDays <= 7)
    return {
      text: `Due in ${diffDays}d`,
      className: "text-amber-600 dark:text-amber-400 font-medium",
    };
  return { text: `Due in ${diffDays}d`, className: "text-muted-foreground" };
}

// Sort by due date and get upcoming deadlines
const upcomingDeadlines = compData.complianceRequirements
  .filter((req) => req.dueDate && req.status !== "compliant")
  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  .slice(0, 5);

export function RegulatoryCalendar() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regulatory Calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px]">
          {upcomingDeadlines.length > 0 ? (
            <ul className="space-y-3">
              {upcomingDeadlines.map((req) => {
                const statusColors: Record<string, string> = {
                  compliant: "border-l-green-500",
                  partial: "border-l-amber-500",
                  "non-compliant": "border-l-red-500",
                  pending: "border-l-blue-500",
                };
                const borderClass =
                  statusColors[req.status as keyof typeof statusColors] ||
                  "border-l-blue-500";

                const relative = getRelativeLabel(req.dueDate);

                return (
                  <li
                    key={req.id}
                    className={`hover:bg-muted/50 cursor-pointer border-l-2 pl-3 transition-colors duration-150 ${borderClass}`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {formatDate(req.dueDate)}
                      </span>
                      <span className={relative.className}>
                        {relative.text}
                      </span>
                    </div>
                    <div className="text-base font-medium">{req.title}</div>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          req.status === "partial"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-100"
                            : req.status === "non-compliant"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100"
                              : req.status === "pending"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-100"
                        }`}
                      >
                        {req.status.charAt(0).toUpperCase() +
                          req.status.slice(1).replace("-", " ")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-muted-foreground py-4 text-center text-sm">
              No upcoming deadlines
            </div>
          )}
        </ScrollArea>
        <div className="mt-3 border-t pt-3">
          <a
            href="/compliance"
            className="text-primary hover:text-primary/80 inline-flex min-h-[44px] items-center text-sm md:min-h-0"
          >
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
