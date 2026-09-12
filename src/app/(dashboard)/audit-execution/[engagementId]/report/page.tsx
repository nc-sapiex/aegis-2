import { notFound } from "next/navigation";
import { getRequiredSession } from "@/data-access/session";
import { getReportStatusForEngagement } from "@/data-access/reports";
import { prismaForTenant } from "@/data-access/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import Link from "next/link";
import { ReportStatusWorkflow } from "@/components/reports/report-status-workflow";
import type { Role } from "@/generated/prisma/enums";
import type { ReportStatus } from "@/actions/reports/schemas";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

export default async function ReportPage({ params }: PageProps) {
  // Next.js 16: params is a Promise (await it)
  const { engagementId } = await params;

  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;
  const userRoles = session.user.roles;

  // Fetch engagement report status
  const engagement = await getReportStatusForEngagement(session, engagementId);

  if (!engagement) {
    notFound();
  }

  const currentStatus = (engagement.reportStatus ?? "DRAFT") as ReportStatus;

  // Resolve reviewer/approver/issuer names
  const db = prismaForTenant(tenantId);

  let reviewedBy = null;
  let approvedBy = null;
  let issuedBy = null;

  if (engagement.reportReviewedById && engagement.reportReviewedAt) {
    const reviewer = await db.user.findUnique({
      where: { id: engagement.reportReviewedById },
      select: { name: true },
    });
    const reviewedAtDate = engagement.reportReviewedAt;
    reviewedBy = {
      name: reviewer?.name || "Unknown",
      at: new Date(reviewedAtDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  if (engagement.reportApprovedById && engagement.reportApprovedAt) {
    const approver = await db.user.findUnique({
      where: { id: engagement.reportApprovedById },
      select: { name: true },
    });
    const approvedAtDate = engagement.reportApprovedAt;
    approvedBy = {
      name: approver?.name || "Unknown",
      at: new Date(approvedAtDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  if (engagement.reportIssuedById && engagement.reportIssuedAt) {
    const issuer = await db.user.findUnique({
      where: { id: engagement.reportIssuedById },
      select: { name: true },
    });
    const issuedAtDate = engagement.reportIssuedAt;
    issuedBy = {
      name: issuer?.name || "Unknown",
      at: new Date(issuedAtDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Audit Report
          </h1>
          <p className="text-muted-foreground">
            {engagement.branch?.name ?? "Branch"} — Report routing & approval
          </p>
          {engagement.auditPlan && (
            <p className="text-muted-foreground mt-1 text-sm">
              FY {engagement.auditPlan.year}-
              {String(engagement.auditPlan.year + 1).slice(2)} •{" "}
              {engagement.auditPlan.quarter.replace(/_/g, " ")}
            </p>
          )}
        </div>
        <Badge variant={currentStatus === "ISSUED" ? "default" : "secondary"}>
          {currentStatus}
        </Badge>
      </div>

      {/* Report Generation Links */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          Report Generation
        </h2>
        <div className="flex gap-4">
          <Link href={`/audit-execution/${engagementId}/generate-pdf`}>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Generate PDF Report
            </Button>
          </Link>
          <Link href={`/audit-execution/${engagementId}/generate-xlsx`}>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Generate Excel Report
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          Generate comprehensive audit reports in PDF or Excel format.
        </p>
      </Card>

      {/* Report Status Workflow */}
      <ReportStatusWorkflow
        engagementId={engagementId}
        currentStatus={currentStatus}
        reviewedBy={reviewedBy}
        approvedBy={approvedBy}
        issuedBy={issuedBy}
        currentUserRoles={userRoles}
        observationCount={engagement.observations.length}
        bhCertSigned={!!engagement.bhCertSignedAt}
        branchName={engagement.branch?.name ?? ""}
        overallRating={engagement.overallRiskRating}
      />
    </div>
  );
}
