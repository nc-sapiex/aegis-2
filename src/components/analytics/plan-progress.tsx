"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "@/lib/icons";

interface PlanProgressProps {
  data: Array<{
    id: string;
    year: number;
    quarter: string;
    status: string;
    total: number;
    completed: number;
    inProgress: number;
    planned: number;
    completionRate: number;
    engagements: Array<{
      id: string;
      status: string;
      scheduledStartDate: Date | null;
      completionDate: Date | null;
      branch: { name: string } | null;
    }>;
  }>;
}

export function PlanProgress({ data }: PlanProgressProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardList className="text-primary h-5 w-5" />
          <CardTitle>Audit Plan Progress</CardTitle>
        </div>
        <CardDescription>
          Track engagement completion across all audit plans
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {data.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No audit plans found.
            </p>
          ) : (
            data.map((plan) => (
              <div key={plan.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">
                      FY {plan.year} - {plan.quarter}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {plan.completed} of {plan.total} engagements completed
                    </p>
                  </div>
                  <Badge variant="outline">{plan.completionRate}%</Badge>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex h-6 overflow-hidden rounded-md border">
                    {/* Completed */}
                    {plan.completed > 0 && (
                      <div
                        className="flex items-center justify-center bg-green-500 text-xs font-medium text-white"
                        style={{
                          width: `${(plan.completed / plan.total) * 100}%`,
                        }}
                      >
                        {plan.completed}
                      </div>
                    )}
                    {/* In Progress */}
                    {plan.inProgress > 0 && (
                      <div
                        className="flex items-center justify-center bg-blue-500 text-xs font-medium text-white"
                        style={{
                          width: `${(plan.inProgress / plan.total) * 100}%`,
                        }}
                      >
                        {plan.inProgress}
                      </div>
                    )}
                    {/* Planned */}
                    {plan.planned > 0 && (
                      <div
                        className="flex items-center justify-center bg-gray-300 text-xs font-medium text-gray-700"
                        style={{
                          width: `${(plan.planned / plan.total) * 100}%`,
                        }}
                      >
                        {plan.planned}
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>Completed: {plan.completed}</span>
                    <span>In Progress: {plan.inProgress}</span>
                    <span>Planned: {plan.planned}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
