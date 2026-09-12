"use client";

import * as React from "react";
import { findings } from "@/data";
import type { FindingsData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, CircleAlert, Clock, AlertTriangle } from "@/lib/icons";

const findingsData = findings as unknown as FindingsData;

const totalFindings = findingsData.findings.length;
const criticalFindings = findingsData.findings.filter(
  (f) => f.severity === "critical",
).length;
const openFindings = findingsData.findings.filter(
  (f) => f.status !== "closed",
).length;
const today = new Date().toISOString().split("T")[0];
const overdueFindings = findingsData.findings.filter(
  (f) => f.targetDate < today && f.status !== "closed",
).length;

export function FindingsCountCards() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card
        className="border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20"
        aria-label="Total findings: {totalFindings}"
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {totalFindings}
              </div>
              <div className="text-muted-foreground text-sm">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className="border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
        aria-label={`Critical findings: ${criticalFindings}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <CircleAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                {criticalFindings}
              </div>
              <div className="text-muted-foreground text-sm">Critical</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
        aria-label={`Open findings: ${openFindings}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                {openFindings}
              </div>
              <div className="text-muted-foreground text-sm">Open</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className="bg-destructive/10 border-destructive/50 dark:bg-destructive/20"
        aria-label={`Overdue findings: ${overdueFindings}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Clock className="text-destructive h-5 w-5" />
            <div>
              <div className="text-destructive text-2xl font-bold">
                {overdueFindings}
              </div>
              <div className="text-muted-foreground text-sm">Overdue</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
