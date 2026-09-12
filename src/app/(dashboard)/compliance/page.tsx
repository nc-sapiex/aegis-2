import { getRequiredSession } from "@/data-access/session";
import { getComplianceItems } from "@/data-access/compliance";
import { ComplianceTable } from "@/components/compliance/compliance-table";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "@/lib/icons";
import Link from "next/link";

export default async function CompliancePage() {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "compliance:read")) {
    redirect("/dashboard");
  }

  const items = await getComplianceItems(session);

  // Calculate summary stats
  const total = items.length;
  const open = items.filter(
    (i) => i.status === "OPEN" || i.status === "BRANCH_RESPONSE_DUE",
  ).length;
  const pending = items.filter(
    (i) =>
      i.status === "BRANCH_RESPONSE_SUBMITTED" || i.status === "ZAC_REVIEW",
  ).length;
  const closed = items.filter(
    (i) => i.status === "CLOSED" || i.status === "ZAC_APPROVED",
  ).length;

  const summaryCards = [
    {
      label: "Total Items",
      count: total,
      icon: Shield,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Open",
      count: open,
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Pending Review",
      count: pending,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "Closed",
      count: closed,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  const canUpdate = hasPermission(userRoles, "compliance:update");
  const canBranchResponse = hasPermission(
    userRoles,
    "compliance:branch_response",
  );
  const canZacReview = hasPermission(userRoles, "compliance:zac_review");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Compliance Registry
          </h1>
          <p className="text-muted-foreground">
            Track and manage compliance items across all branches
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-2 p-3 md:gap-3 md:p-4">
              <div className={`rounded-lg p-1.5 md:p-2 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold md:text-xl">{s.count}</p>
                <p className="text-muted-foreground text-sm">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ComplianceTable
        items={items}
        canUpdate={canUpdate}
        canBranchResponse={canBranchResponse}
        canZacReview={canZacReview}
      />

      {/* Board Reporting CTA (ISS-009) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Board Reporting</CardTitle>
          <CardDescription>
            Prepare compliance reports for ACB and board review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/governance">
              Prepare Board Report
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
