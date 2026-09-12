"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle } from "@/lib/icons";
import type { BmResponseActionPointData } from "@/data-access/rbia-bm-response";

interface BmBatchSubmitModalProps {
  actionPoints: BmResponseActionPointData[];
  responses: Record<string, string>;
  onConfirm: () => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Review summary modal for batch submission confirmation.
 *
 * Shows a table listing each AP with its serial number, title, response text
 * snippet (first 100 chars), and confirmation buttons.
 *
 * Per CONTEXT.md: "Submit shows a summary modal listing all AP responses and
 * attachments; BM reviews and confirms before final submission."
 */
export function BmBatchSubmitModal({
  actionPoints,
  responses,
  onConfirm,
  open,
  onOpenChange,
}: BmBatchSubmitModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count responded vs total for the summary
  const respondedCount = actionPoints.filter(
    (ap) =>
      ap.status === "BM_RESPONDED" ||
      (responses[ap.id] && responses[ap.id].trim().length > 0),
  ).length;
  const unrespondedCount = actionPoints.length - respondedCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review & Submit All Responses</DialogTitle>
          <DialogDescription>
            Please review your responses below before submitting. This action
            will submit all pending responses to the audit team.
          </DialogDescription>
        </DialogHeader>

        {/* Warning if any unresponded */}
        {unrespondedCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {unrespondedCount} action point{unrespondedCount > 1 ? "s" : ""}{" "}
              still require a response.
            </span>
          </div>
        )}

        {/* Summary table */}
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Response</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {actionPoints.map((ap) => {
                const text =
                  responses[ap.id]?.trim() || ap.bmResponseText || "";
                const hasText = text.length > 0;
                const snippet =
                  text.length > 100 ? `${text.slice(0, 100)}...` : text;

                return (
                  <tr key={ap.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      AP-{String(ap.serialNo).padStart(3, "0")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{ap.title}</span>
                      <Badge
                        className={`ml-2 text-xs ${
                          ap.severity === "CRITICAL"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : ap.severity === "HIGH"
                              ? "border-orange-200 bg-orange-50 text-orange-700"
                              : ""
                        }`}
                        variant={
                          ap.severity === "LOW" || ap.severity === "MEDIUM"
                            ? "outline"
                            : undefined
                        }
                      >
                        {ap.severity}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground max-w-[200px] px-3 py-2 text-xs">
                      {hasText ? snippet : <em>No response</em>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasText ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="mx-auto h-4 w-4 text-amber-500" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || unrespondedCount > 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm & Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
