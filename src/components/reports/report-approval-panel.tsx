"use client";

import React, { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { transitionReportStatus } from "@/actions/reports/transition-report";
import type { ReportStatus } from "@/actions/reports/schemas";

interface ReportApprovalPanelProps {
  engagementId: string;
  currentStatus: ReportStatus;
  targetStatus: ReportStatus;
  disabled?: boolean;
}

export function ReportApprovalPanel({
  engagementId,
  currentStatus,
  targetStatus,
  disabled = false,
}: ReportApprovalPanelProps) {
  const [comments, setComments] = useState("");
  const [isPending, startTransition] = useTransition();

  const isRework =
    (currentStatus === "REVIEWED" && targetStatus === "DRAFT") ||
    (currentStatus === "APPROVED" && targetStatus === "REVIEWED");

  const buttonLabel = isRework
    ? `Send Back to ${targetStatus}`
    : `Mark as ${targetStatus}`;

  const buttonVariant = isRework ? "destructive" : "default";

  const handleTransition = () => {
    if (disabled) {
      toast.error("Pre-conditions not met. Please check the warnings above.");
      return;
    }

    startTransition(async () => {
      const result = await transitionReportStatus({
        engagementId,
        targetStatus,
        comments: comments || undefined,
      });

      if (result.success) {
        toast.success(`Report status updated to ${targetStatus}`);
        setComments("");
      } else {
        toast.error(result.error || "Failed to update report status");
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">
            {currentStatus} → {targetStatus}
          </h3>
          <p className="text-muted-foreground text-sm">
            {isRework
              ? "Send the report back for rework"
              : `Approve and move to ${targetStatus} status`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`comments-${targetStatus}`}>
          Comments {isRework ? "(required for rework)" : "(optional)"}
        </Label>
        <Textarea
          id={`comments-${targetStatus}`}
          placeholder={
            isRework
              ? "Explain why the report is being sent back..."
              : "Add any comments about this transition..."
          }
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          disabled={isPending || disabled}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleTransition}
          disabled={isPending || disabled || (isRework && !comments.trim())}
          variant={buttonVariant}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {isRework ? (
                <ArrowLeft className="mr-2 h-4 w-4" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {buttonLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
