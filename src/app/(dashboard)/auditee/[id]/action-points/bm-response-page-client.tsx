"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { submitBmResponse } from "@/actions/rbia/findings";
import { BmDeadlineBanner } from "@/components/rbia/bm-deadline-banner";
import { BmResponseApCard } from "@/components/rbia/bm-response-ap-card";
import { BmBatchSubmitModal } from "@/components/rbia/bm-batch-submit-modal";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Send } from "@/lib/icons";
import type {
  BmResponseBatchData,
  BmResponseActionPointData,
} from "@/data-access/rbia-bm-response";

type Props = {
  batch: BmResponseBatchData;
  actionPoints: BmResponseActionPointData[];
  engagementId: string;
};

export function BmResponsePageClient({
  batch,
  actionPoints,
  engagementId,
}: Props) {
  // Track response text per AP — prefill from DB if already responded
  const [responses, setResponses] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ap of actionPoints) {
      if (ap.bmResponseText) {
        initial[ap.id] = ap.bmResponseText;
      }
    }
    return initial;
  });

  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Count how many APs have a response (either from DB or user input)
  const respondedCount = actionPoints.filter(
    (ap) =>
      ap.status === "BM_RESPONDED" ||
      (responses[ap.id] && responses[ap.id].trim().length > 0),
  ).length;
  const totalCount = actionPoints.length;
  const allResponded = respondedCount >= totalCount && totalCount > 0;

  const handleResponseChange = useCallback((apId: string, text: string) => {
    setResponses((prev) => ({ ...prev, [apId]: text }));
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    // Submit each AP that has a response but is not yet BM_RESPONDED
    const toSubmit = actionPoints.filter(
      (ap) =>
        ap.status !== "BM_RESPONDED" &&
        responses[ap.id] &&
        responses[ap.id].trim().length > 0,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const ap of toSubmit) {
      const result = await submitBmResponse({
        actionPointId: ap.id,
        responseText: responses[ap.id].trim(),
      });
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        toast.error(
          `Failed to submit response for AP-${ap.serialNo}: ${result.error}`,
        );
      }
    }

    if (successCount > 0) {
      toast.success(
        `Successfully submitted ${successCount} response${successCount > 1 ? "s" : ""}`,
      );
    }
    if (errorCount === 0) {
      setSubmitModalOpen(false);
    }
  }, [actionPoints, responses]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Action Point Responses
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {batch.engagement.branchName} &mdash; {batch.engagement.planLabel}
        </p>
      </div>

      {/* Deadline banner */}
      <BmDeadlineBanner deadline={batch.deadline} status={batch.status} />

      {/* Progress counter */}
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <CheckCircle2
          className={`h-5 w-5 ${allResponded ? "text-green-600" : "text-muted-foreground"}`}
        />
        <div>
          <p className="text-sm font-medium">
            {respondedCount} / {totalCount} addressed
          </p>
          <p className="text-muted-foreground text-xs">
            {allResponded
              ? "All action points have been addressed. You may submit."
              : "Please respond to all action points before submitting."}
          </p>
        </div>
      </div>

      {/* Action Point cards */}
      <div className="space-y-3">
        {actionPoints.map((ap) => (
          <BmResponseApCard
            key={ap.id}
            actionPoint={ap}
            responseText={responses[ap.id] ?? ""}
            onResponseChange={handleResponseChange}
            engagementId={engagementId}
          />
        ))}
      </div>

      {/* Submit button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!allResponded}
          onClick={() => setSubmitModalOpen(true)}
        >
          <Send className="mr-2 h-4 w-4" />
          Review & Submit All Responses
        </Button>
      </div>

      {/* Batch submit modal */}
      <BmBatchSubmitModal
        actionPoints={actionPoints}
        responses={responses}
        onConfirm={handleConfirmSubmit}
        open={submitModalOpen}
        onOpenChange={setSubmitModalOpen}
      />
    </div>
  );
}
