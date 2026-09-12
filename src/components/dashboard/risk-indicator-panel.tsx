"use client";

import * as React from "react";
import { findings, demoComplianceRequirements } from "@/data";
import type { FindingsData, ComplianceData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleAlert, XCircle, Clock, TrendingUp } from "@/lib/icons";

const findingsData = findings as unknown as FindingsData;
const compData = demoComplianceRequirements as unknown as ComplianceData;

// Compute overall risk level
const criticalFindingsOpen = findingsData.findings.filter(
  (f) => f.severity === "critical" && f.status !== "closed",
).length;
const highFindingsOpen = findingsData.findings.filter(
  (f) => f.severity === "high" && f.status !== "closed",
).length;
const nonCompliantItems = compData.complianceRequirements.filter(
  (r) => r.status === "non-compliant",
).length;

const today = new Date().toISOString().split("T")[0];
const overdueFindings = findingsData.findings.filter(
  (f) => f.targetDate < today && f.status !== "closed",
).length;

let riskLevel = "Low Risk";
let riskColor =
  "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-100 dark:border-green-700";
let riskBorderColor = "border-l-green-500";
let riskIcon = (
  <TrendingUp className="h-5 w-5 text-green-700 dark:text-green-300" />
);

if (criticalFindingsOpen > 0) {
  riskLevel = "High Risk";
  riskColor =
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700";
  riskBorderColor = "border-l-red-500";
  riskIcon = <CircleAlert className="h-5 w-5 text-red-700 dark:text-red-300" />;
} else if (highFindingsOpen > 2) {
  riskLevel = "Medium-High Risk";
  riskColor =
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-700";
  riskBorderColor = "border-l-orange-500";
  riskIcon = (
    <CircleAlert className="h-5 w-5 text-orange-700 dark:text-orange-300" />
  );
} else if (nonCompliantItems > 0) {
  riskLevel = "Medium Risk";
  riskColor =
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700";
  riskBorderColor = "border-l-amber-500";
  riskIcon = (
    <CircleAlert className="h-5 w-5 text-amber-700 dark:text-amber-300" />
  );
}

export function RiskIndicatorPanel() {
  return (
    <Card className={`border-l-4 ${riskBorderColor}`}>
      <CardHeader>
        <CardTitle>Risk Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex flex-col gap-2 rounded-lg border-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${riskColor}`}
          role="status"
          aria-label={`Risk level: ${riskLevel}`}
        >
          <div className="flex items-center gap-3">
            {riskIcon}
            <span className="text-base font-semibold sm:text-lg">
              {riskLevel}
            </span>
          </div>
          <div className="text-xs opacity-75 sm:text-sm">
            Overall Risk Level
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-medium">Contributing Factors</h4>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <CircleAlert className="text-destructive h-4 w-4" />
              <span>
                {criticalFindingsOpen} critical finding
                {criticalFindingsOpen !== 1 ? "s" : ""} unresolved
              </span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <XCircle className="text-destructive h-4 w-4" />
              <span>
                {nonCompliantItems} non-compliant requirement
                {nonCompliantItems !== 1 ? "s" : ""}
              </span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Clock className="text-destructive h-4 w-4" />
              <span>
                {overdueFindings} overdue finding
                {overdueFindings !== 1 ? "s" : ""}
              </span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>CRAR monitoring in progress</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
