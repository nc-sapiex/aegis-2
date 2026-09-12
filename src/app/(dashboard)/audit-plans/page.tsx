import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { PlanGenerator } from "@/components/audit-plans/plan-generator";
import { WhatIfSimulator } from "@/components/audit-plans/what-if-simulator";
import { SurpriseAuditScheduler } from "@/components/audit-plans/surprise-audit-scheduler";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

/**
 * Get status badge variant for AuditPlanStatus
 */
function getStatusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "IN_PROGRESS":
      return "secondary";
    case "PLANNED":
      return "outline";
    case "ON_HOLD":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

/**
 * Audit Plans Page
 *
 * Features:
 * - Annual audit plan generator (RAM-based scheduling)
 * - List of existing audit plans with engagement counts
 */
export default async function AuditPlansPage() {
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Fetch branches for what-if simulator (R53)
  const branches = await db.branch.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, ramScore: true },
    orderBy: { code: "asc" },
  });

  const branchesForSimulator = branches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    ramScore: b.ramScore ? Number(b.ramScore) : null,
  }));

  // Fetch team members (auditors) for surprise audit team lead selection (R71)
  const teamMembers = await db.user.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Fetch existing audit plans with engagements
  const auditPlans = await db.auditPlan.findMany({
    where: { tenantId },
    include: {
      engagements: {
        include: {
          branch: {
            select: { code: true, name: true },
          },
        },
      },
    },
    orderBy: [{ year: "desc" }, { quarter: "asc" }],
  });

  // Get quarter label
  const getQuarterLabel = (quarter: string): string => {
    const labels: Record<string, string> = {
      Q1_APR_JUN: "Q1 (Apr-Jun)",
      Q2_JUL_SEP: "Q2 (Jul-Sep)",
      Q3_OCT_DEC: "Q3 (Oct-Dec)",
      Q4_JAN_MAR: "Q4 (Jan-Mar)",
    };
    return labels[quarter] || quarter;
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Annual Audit Plans
        </h1>
        <p className="text-muted-foreground text-sm">
          Generate and manage audit plans based on RAM scores and audit
          frequency
        </p>
      </div>

      {/* Plan Generator */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Annual Audit Plan</CardTitle>
          <CardDescription>
            Auto-schedule branch audits based on RAM scores, audit frequency,
            and last audit date. High-risk branches (RAM &gt; 3.5) are scheduled
            for 12-month audits, medium-risk (2.5-3.5) for 18-month audits, and
            low-risk (&lt; 2.5) for 24-month audits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanGenerator />
        </CardContent>
      </Card>

      {/* Existing Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Audit Plans</CardTitle>
          <CardDescription>
            {auditPlans.length > 0
              ? `${auditPlans.length} audit plan${auditPlans.length > 1 ? "s" : ""} found`
              : "No audit plans created yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditPlans.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead>Quarter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Engagements</TableHead>
                    <TableHead>Branches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditPlans.map((plan) => {
                    const fyLabel = `${plan.year}-${String(plan.year + 1).slice(2)}`;
                    const branches = plan.engagements
                      .filter((e) => e.branch)
                      .map((e) => e.branch!.code)
                      .slice(0, 5)
                      .join(", ");
                    const moreCount = Math.max(0, plan.engagements.length - 5);

                    return (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">
                          FY {fyLabel}
                        </TableCell>
                        <TableCell>{getQuarterLabel(plan.quarter)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(plan.status)}>
                            {plan.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {plan.engagements.length > 0 ? (
                            <Link
                              href="/audit-execution"
                              className="text-primary hover:underline"
                            >
                              {plan.engagements.length}
                            </Link>
                          ) : (
                            plan.engagements.length
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {branches}
                          {moreCount > 0 && ` +${moreCount} more`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
              No audit plans created yet. Use the generator above to create your
              first plan.
            </div>
          )}
        </CardContent>
      </Card>

      {/* What-If Simulator (R53) */}
      <WhatIfSimulator branches={branchesForSimulator} />

      {/* Surprise Audit Scheduler (R71) */}
      <SurpriseAuditScheduler
        branches={branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
        }))}
        auditPlans={auditPlans.map((p) => ({
          id: p.id,
          year: p.year,
          quarter: p.quarter,
        }))}
        teamMembers={teamMembers.map((m) => ({
          id: m.id,
          name: m.name ?? "Unnamed",
        }))}
      />
    </div>
  );
}
