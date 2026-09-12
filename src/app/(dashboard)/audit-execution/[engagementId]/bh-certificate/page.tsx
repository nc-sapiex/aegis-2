import { notFound } from "next/navigation";
import { getRequiredSession } from "@/data-access/session";
import {
  getEngagementForBhCertificate,
  deriveBhCertStatus,
} from "@/data-access/bh-certificate";
import { prismaForTenant } from "@/data-access/prisma";
import { BhCertificateWorkflow } from "@/components/audit-execution/bh-certificate-workflow";
import type { Role } from "@/generated/prisma/enums";

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

export default async function BhCertificatePage({ params }: PageProps) {
  // Next.js 16: params is a Promise (await it)
  const { engagementId } = await params;

  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;
  const userRoles = session.user.roles;

  // Fetch engagement data
  const engagement = await getEngagementForBhCertificate(session, engagementId);

  if (!engagement) {
    notFound();
  }

  // Derive BH certificate status
  const status = deriveBhCertStatus({
    bhCertSignedAt: engagement.bhCertSignedAt,
    bhCertCountersignedAt: engagement.bhCertCountersignedAt,
  });

  // Compute observation summary
  const observationSummary = {
    total: engagement.observations.length,
    critical: engagement.observations.filter((o) => o.severity === "CRITICAL")
      .length,
    high: engagement.observations.filter((o) => o.severity === "HIGH").length,
    medium: engagement.observations.filter((o) => o.severity === "MEDIUM")
      .length,
    low: engagement.observations.filter((o) => o.severity === "LOW").length,
  };

  // Resolve signer names
  let signedBy = null;
  let countersignedBy = null;

  const db = prismaForTenant(tenantId);

  if (engagement.bhCertSignedById && engagement.bhCertSignedAt) {
    const signer = await db.user.findUnique({
      where: { id: engagement.bhCertSignedById },
      select: { name: true },
    });
    const signedAtDate = engagement.bhCertSignedAt;
    signedBy = {
      name: signer?.name || "Unknown",
      signedAt:
        signedAtDate instanceof Date
          ? signedAtDate.toISOString()
          : signedAtDate,
    };
  }

  if (engagement.bhCertCountersignedById && engagement.bhCertCountersignedAt) {
    const countersigner = await db.user.findUnique({
      where: { id: engagement.bhCertCountersignedById },
      select: { name: true },
    });
    const countersignedAtDate = engagement.bhCertCountersignedAt;
    countersignedBy = {
      name: countersigner?.name || "Unknown",
      signedAt:
        countersignedAtDate instanceof Date
          ? countersignedAtDate.toISOString()
          : countersignedAtDate,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          BH Certificate
        </h1>
        <p className="text-muted-foreground">
          {engagement.branch?.name || "Branch"} — Digital sign-off
        </p>
        {engagement.auditNumber && (
          <p className="text-muted-foreground mt-1 text-sm">
            Audit: {engagement.auditNumber}
          </p>
        )}
      </div>

      <BhCertificateWorkflow
        engagementId={engagementId}
        currentStatus={status}
        signedBy={signedBy}
        countersignedBy={countersignedBy}
        comments={engagement.bhCertComments}
        currentUserRole={userRoles}
        currentUserName={session.user.name}
        observationSummary={observationSummary}
      />
    </div>
  );
}
