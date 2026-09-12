import { notFound } from "next/navigation";
import { getRequiredSession } from "@/data-access/session";
import { getBranchProfileData } from "@/data-access/pre-audit-profiling";
import { BranchProfile } from "@/components/pre-audit/branch-profile";
import { ArrowLeft } from "@/lib/icons";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

/**
 * Pre-audit branch profiling page (R12)
 *
 * Displays comprehensive branch context before starting an audit engagement:
 * - Branch details and metadata
 * - Last audit engagement summary
 * - Current RAM score with category breakdown
 * - Prior findings summary
 * - Compliance status overview
 *
 * All data comes from real database aggregations.
 */
export default async function PreAuditProfilingPage({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await getRequiredSession();

  const data = await getBranchProfileData(session, resolvedParams.branchId);

  if (!data.branch) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <a
          href="/branches"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Branches
        </a>

        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Pre-Audit Branch Profiling
          </h1>
          <p className="text-muted-foreground">
            Review branch context before starting engagement: {data.branch.name}{" "}
            ({data.branch.code})
          </p>
        </div>
      </div>

      {/* Branch Profile Component */}
      <BranchProfile data={data} />
    </div>
  );
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;

  return {
    title: `Pre-Audit Profiling - Branch ${resolvedParams.branchId}`,
    description: "Branch context review for audit planning",
  };
}
