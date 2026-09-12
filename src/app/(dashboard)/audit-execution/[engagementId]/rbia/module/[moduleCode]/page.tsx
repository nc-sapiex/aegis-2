import { Suspense } from "react";
import Link from "next/link";
import { getRequiredSession } from "@/data-access/session";
import {
  getExaminationTree,
  type ExaminationTreeNode,
} from "@/data-access/rbia-examination";
import { getEngagementModuleScores } from "@/data-access/rbia-scoring";
import {
  getViolationSummary,
  getExaminationProgress,
} from "@/data-access/account-examination";
import { RbiaExaminationTree } from "@/components/rbia/rbia-examination-tree";
import { ComplianceSummary } from "@/components/rbia/compliance-summary";
import { notFound } from "next/navigation";
import { ChevronLeft } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ engagementId: string; moduleCode: string }>;
  searchParams: Promise<{ expanded?: string }>;
}

// ── Loading skeleton for the tree table ──────────────────────────────────────

function TreeSkeleton() {
  const depths = [0, 1, 1, 2, 2, 2, 1, 2, 2, 1];
  return (
    <Card className="overflow-hidden">
      {/* Sticky header skeleton */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="w-48">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="mt-1 ml-auto h-3 w-16" />
          </div>
        </div>
      </div>
      {/* Filter bar skeleton */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
      </div>
      {/* Tree rows skeleton */}
      <div className="space-y-0">
        {depths.map((depth, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-b px-4 py-2.5"
            style={{ paddingLeft: `${16 + depth * 20}px` }}
          >
            <Skeleton className="h-4 w-4 shrink-0" />
            <Skeleton
              className="h-4 shrink-0"
              style={{ width: `${180 - depth * 20}px` }}
            />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Per-module RBIA examination tree page.
 *
 * This page is the primary auditor workspace. It renders the hierarchical
 * examination tree for a single module, with inline scoring buttons,
 * filter toggles, and working notes panels.
 *
 * Route: /audit-execution/[engagementId]/rbia/module/[moduleCode]
 *
 * The parent RBIA layout provides back link, stepper, transition control,
 * and tab navigation. This page adds a breadcrumb back to the examination
 * tab and renders the tree component with module-specific data.
 */
export default async function ModuleExaminationPage({
  params,
  searchParams,
}: PageProps) {
  const { engagementId, moduleCode } = await params;
  const { expanded: initialExpanded = "" } = await searchParams;
  const session = await getRequiredSession();

  // Fetch full tree, module scores, and examination progress in parallel
  const [tree, moduleScores, examProgress] = await Promise.all([
    getExaminationTree(session, engagementId),
    getEngagementModuleScores(session, engagementId),
    getExaminationProgress(session, engagementId, moduleCode),
  ]);

  // Find the module node by code (depth-1 nodes are modules)
  const moduleNode = findModuleByCode(tree, moduleCode);
  if (!moduleNode) {
    notFound();
  }

  // Extract per-module score data
  const moduleScoreRow = moduleScores.find(
    (ms) => ms.moduleCode === moduleCode,
  );

  const moduleScore = {
    scoredCount: moduleScoreRow?.scoredCount ?? 0,
    totalLeafCount: moduleScoreRow?.totalLeafCount ?? 0,
    weightedScore: null as number | null,
  };

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

      {/* Examination tree with Suspense for client-side useSearchParams */}
      <Card className="overflow-hidden">
        <Suspense fallback={<TreeSkeleton />}>
          <RbiaExaminationTree
            tree={moduleNode.children}
            engagementId={engagementId}
            initialExpanded={initialExpanded}
            moduleName={moduleNode.name}
            moduleScore={moduleScore}
          />
        </Suspense>
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

// ── Helper: find module node by code in the full tree ────────────────────────

function findModuleByCode(
  tree: ExaminationTreeNode[],
  moduleCode: string,
): ExaminationTreeNode | null {
  // Module nodes are at depth 1, which are children of the root (depth 0)
  for (const root of tree) {
    // Check root itself (if depth 0 has modules as children)
    if (root.code === moduleCode && root.depth === 1) {
      return root;
    }
    // Check children (standard case: root depth=0, modules depth=1)
    for (const child of root.children) {
      if (child.code === moduleCode && child.depth === 1) {
        return child;
      }
    }
  }
  return null;
}
