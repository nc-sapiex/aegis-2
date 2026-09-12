"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, FileBarChart } from "@/lib/icons";
import type { BoardReportReadinessItem } from "@/data-access/dashboard";

// ─── Component ──────────────────────────────────────────────────────────────

interface BoardReportReadinessProps {
  sections: BoardReportReadinessItem[];
}

export function BoardReportReadiness({ sections }: BoardReportReadinessProps) {
  const readyCount = sections.filter((s) => s.isReady).length;
  const allReady = readyCount === sections.length && sections.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileBarChart className="h-4 w-4" />
          Board Report Readiness
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No report sections configured.
          </p>
        ) : (
          <>
            <div className="text-muted-foreground text-xs">
              {readyCount} of {sections.length} sections ready
            </div>
            <ul className="space-y-2">
              {sections.map((section) => (
                <li key={section.section} className="flex items-start gap-2">
                  {section.isReady ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm">{section.section}</span>
                    {section.missingData && (
                      <p className="text-muted-foreground text-xs">
                        Missing: {section.missingData}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {allReady && (
              <Button size="sm" className="w-full" asChild>
                <Link href="/reports">Generate Board Report</Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
