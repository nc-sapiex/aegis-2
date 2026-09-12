"use client";

/**
 * Completion Summary
 *
 * Shown after onboarding wizard completes successfully.
 * Displays entity counts and provides navigation to dashboard.
 */

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ShieldCheck,
  Building2,
  Users,
  ArrowRight,
} from "@/lib/icons";

interface CompletionSummaryProps {
  complianceCount: number;
  departmentCount: number;
  branchCount: number;
  invitedUserCount: number;
  bankName: string;
}

export function CompletionSummary({
  complianceCount,
  departmentCount,
  branchCount,
  invitedUserCount,
  bankName,
}: CompletionSummaryProps) {
  const router = useRouter();

  const stats = [
    {
      label: "Compliance Requirements",
      value: complianceCount,
      icon: ShieldCheck,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Departments",
      value: departmentCount,
      icon: Building2,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Branches",
      value: branchCount,
      icon: Building2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Users Invited",
      value: invitedUserCount,
      icon: Users,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Setup Complete!</CardTitle>
          <p className="text-muted-foreground text-sm">
            {bankName} has been successfully configured on AEGIS.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}
                >
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold">{stat.value}</p>
                  <p className="text-muted-foreground text-xs">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {invitedUserCount > 0 && (
            <p className="text-muted-foreground text-center text-xs">
              Invitation emails will be sent to invited users.
            </p>
          )}

          <Button onClick={() => router.push("/dashboard")} className="w-full">
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
