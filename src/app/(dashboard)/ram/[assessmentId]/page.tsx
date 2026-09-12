import { getRequiredSession } from "@/data-access/session";
import {
  getRamAssessmentWithScores,
  getRamParameterConfigs,
} from "@/data-access/ram";
import { RamScoreForm } from "@/components/ram/ram-score-form";
import { RamResultCard } from "@/components/ram/ram-result-card";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "@/lib/icons";

interface PageProps {
  params: Promise<{ assessmentId: string }>;
}

export default async function RamAssessmentDetailPage({ params }: PageProps) {
  const { assessmentId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "ram:read")) {
    redirect("/dashboard");
  }

  const [assessment, allParams] = await Promise.all([
    getRamAssessmentWithScores(session, assessmentId),
    getRamParameterConfigs(session),
  ]);

  if (!assessment) {
    notFound();
  }

  const canEdit =
    hasPermission(userRoles, "ram:create") && assessment.status === "DRAFT";
  const canCompute =
    hasPermission(userRoles, "ram:create") && assessment.scores.length > 0;
  const canApprove =
    hasPermission(userRoles, "ram:approve") && assessment.status === "COMPUTED";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          RAM Assessment — {assessment.branch?.name}
        </h1>
        <p className="text-muted-foreground">
          {assessment.assessmentYear} • Status: {assessment.status}
        </p>
      </div>

      {/* Show result card if computed */}
      {assessment.compositeScore && (
        <RamResultCard
          compositeScore={Number(assessment.compositeScore)}
          riskCategory={assessment.riskCategory ?? ""}
          auditFrequency={assessment.auditFrequency ?? 0}
          status={assessment.status}
          repeatUpliftApplied={assessment.repeatUpliftApplied ?? false}
          repeatFindingCount={assessment.repeatFindingCount ?? 0}
          rawCompositeScore={
            assessment.rawCompositeScore
              ? Number(assessment.rawCompositeScore)
              : undefined
          }
        />
      )}

      {/* Approved banner (ISS-022) */}
      {assessment.status === "APPROVED" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Assessment Approved — Ready for Audit Planning
          </span>
        </div>
      )}

      {/* Next step CTA when approved (ISS-006) */}
      {assessment.status === "APPROVED" && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-green-800">
              Next Step
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Assessment approved. Generate audit plans based on this risk
              assessment.
            </p>
            <Button asChild size="sm">
              <Link href="/audit-plans">
                Proceed to Audit Planning
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Score entry form */}
      <RamScoreForm
        assessmentId={assessment.id}
        allParams={allParams}
        existingScores={assessment.scores}
        canEdit={canEdit}
        canCompute={canCompute}
        canApprove={canApprove}
        status={assessment.status}
      />
    </div>
  );
}
