import Link from "next/link";
import { getRequiredSession } from "@/data-access/session";
import { getModuleRegister } from "@/data-access/engagement-statements";
import { getEngagementModuleScores } from "@/data-access/rbia-scoring";
import {
  getViolationSummary,
  getExaminationProgress,
} from "@/data-access/account-examination";
import {
  ExaminationRegister,
  type RegisterStatement,
  type RegisterResponse,
} from "@/components/rbia/examination-register";
import { ComplianceSummary } from "@/components/rbia/compliance-summary";
import { notFound } from "next/navigation";
import { ChevronLeft } from "@/lib/icons";
import { Card } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ engagementId: string; moduleCode: string }>;
}

/**
 * Per-module RBIA examination register page.
 *
 * Route: /audit-execution/[engagementId]/rbia/module/[moduleCode]
 *
 * The parent RBIA layout provides back link, stepper, transition control,
 * and tab navigation. This page adds a breadcrumb back to the examination
 * tab and renders the flat statement register for this module's leaves.
 */
export default async function ModuleExaminationPage({ params }: PageProps) {
  const { engagementId, moduleCode } = await params;
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  const [register, moduleScores, examProgress] = await Promise.all([
    getModuleRegister(tenantId, engagementId, moduleCode),
    getEngagementModuleScores(session, engagementId),
    getExaminationProgress(session, engagementId, moduleCode),
  ]);

  const moduleScoreRow = moduleScores.find(
    (ms) => ms.moduleCode === moduleCode,
  );
  if (!moduleScoreRow && register.length === 0) {
    notFound();
  }

  const statements: RegisterStatement[] = register.map((row) => ({
    id: row.id,
    code: row.code,
    text: row.text,
    isCritical: row.isCritical,
    origin: row.origin,
  }));

  const initialResponses: Record<string, RegisterResponse> = Object.fromEntries(
    register.map((row) => [
      row.id,
      {
        value: row.scoreLabel,
        remarks: row.remarks,
        isNotApplicable: row.isNotApplicable,
        notApplicableReason: row.notApplicableReason,
        version: row.version,
        respondedByName: row.respondedByName,
      },
    ]),
  );

  // Conditionally fetch violation summary for credit modules with sampled data
  const hasInstanceData = examProgress.totalAccounts > 0;
  const complianceSummaryData = hasInstanceData
    ? await getViolationSummary(session, engagementId, moduleCode).then(
        (violationSummary) => ({
          questions: violationSummary.map((v) => ({
            questionId: v.questionId,
            questionText: v.questionText,
            totalAccounts: v.totalAccounts,
            compliantCount: v.complianceCount,
            violationCount: v.violationCount,
          })),
          totalSampledAccounts: examProgress.totalAccounts,
        }),
      )
    : null;

  const basePath = `/audit-execution/${engagementId}/rbia`;

  return (
    <div className="space-y-4">
      {/* Breadcrumb back to examination tab */}
      <Link
        href={basePath}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Examination
      </Link>

      <h2 className="text-xl font-semibold">
        {moduleScoreRow?.moduleName ?? moduleCode}
      </h2>

      <Card className="overflow-hidden">
        {statements.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">
            No statements in this module for this engagement.
          </p>
        ) : (
          <ExaminationRegister
            engagementId={engagementId}
            statements={statements}
            initialResponses={initialResponses}
          />
        )}
      </Card>

      {/* Compliance Summary — only shown for credit modules with sampled data */}
      {complianceSummaryData && (
        <ComplianceSummary
          questions={complianceSummaryData.questions}
          totalSampledAccounts={complianceSummaryData.totalSampledAccounts}
        />
      )}
    </div>
  );
}
