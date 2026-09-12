"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AuditPlan } from "@/types";

interface AuditCalendarProps {
  audits: AuditPlan[];
  typeFilter: string;
  onAuditClick: (audit: AuditPlan) => void;
}

const FY_MONTHS = [
  { month: 3, year: 2025, label: "Apr 2025" },
  { month: 4, year: 2025, label: "May 2025" },
  { month: 5, year: 2025, label: "Jun 2025" },
  { month: 6, year: 2025, label: "Jul 2025" },
  { month: 7, year: 2025, label: "Aug 2025" },
  { month: 8, year: 2025, label: "Sep 2025" },
  { month: 9, year: 2025, label: "Oct 2025" },
  { month: 10, year: 2025, label: "Nov 2025" },
  { month: 11, year: 2025, label: "Dec 2025" },
  { month: 0, year: 2026, label: "Jan 2026" },
  { month: 1, year: 2026, label: "Feb 2026" },
  { month: 2, year: 2026, label: "Mar 2026" },
] as const;

const AUDIT_STATUS_BORDER = {
  completed: "border-l-emerald-500",
  "in-progress": "border-l-blue-500",
  planned: "border-l-slate-400",
  "on-hold": "border-l-amber-500",
  cancelled: "border-l-red-500",
} as const;

export function AuditCalendar({
  audits,
  typeFilter,
  onAuditClick,
}: AuditCalendarProps) {
  // Filter audits by type
  const filteredAudits = React.useMemo(() => {
    if (typeFilter === "all") return audits;
    return audits.filter((audit) => audit.type === typeFilter);
  }, [audits, typeFilter]);

  // Helper to extract month/year from date string
  const getAuditMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    return { month: d.getMonth(), year: d.getFullYear() };
  };

  // Group audits by month
  const auditsByMonth = React.useMemo(() => {
    const grouped: Record<string, AuditPlan[]> = {};

    filteredAudits.forEach((audit) => {
      const { month, year } = getAuditMonth(audit.plannedStartDate);
      const key = `${year}-${month}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(audit);
    });

    return grouped;
  }, [filteredAudits]);

  const handleAuditClick = (
    e: React.MouseEvent | React.KeyboardEvent,
    audit: AuditPlan,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onAuditClick(audit);
  };

  const handleKeyDown = (e: React.KeyboardEvent, audit: AuditPlan) => {
    if (e.key === "Enter" || e.key === " ") {
      handleAuditClick(e, audit);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
      {FY_MONTHS.map((monthData) => {
        const monthKey = `${monthData.year}-${monthData.month}`;
        const monthAudits = auditsByMonth[monthKey] || [];

        return (
          <Card key={monthKey}>
            <CardHeader className="p-3 pb-1 sm:pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium sm:text-sm">
                {monthData.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {monthAudits.length > 0 ? (
                <div className="space-y-1.5">
                  {monthAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className={cn(
                        "hover:bg-accent bg-muted/30 cursor-pointer truncate rounded border-l-2 px-2 py-1.5 text-sm font-medium transition-colors duration-150 sm:py-1",
                        AUDIT_STATUS_BORDER[audit.status],
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleAuditClick(e, audit)}
                      onKeyDown={(e) => handleKeyDown(e, audit)}
                      aria-label={`${audit.name} - ${audit.status}`}
                    >
                      {audit.name}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="min-h-[2rem]" />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
