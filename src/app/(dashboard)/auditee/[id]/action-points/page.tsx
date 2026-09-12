import { requirePermission } from "@/lib/guards";
import { getBmResponseBatchForEngagement } from "@/data-access/rbia-bm-response";
import { BmResponsePageClient } from "./bm-response-page-client";
import { AlertTriangle } from "@/lib/icons";

export default async function BmResponseActionPointsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth guard: only BRANCH_HEAD (action_point:bm_respond) can access
  const session = await requirePermission("action_point:bm_respond");

  const { id: engagementId } = await params;
  const data = await getBmResponseBatchForEngagement(session, engagementId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="rounded-full bg-amber-50 p-4">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold">No Response Batch Found</h2>
        <p className="text-muted-foreground max-w-md text-center text-sm">
          There is no active response batch for this engagement. The audit team
          has not yet issued Action Points requiring your response.
        </p>
      </div>
    );
  }

  return (
    <BmResponsePageClient
      batch={data.batch}
      actionPoints={data.actionPoints}
      engagementId={engagementId}
    />
  );
}
