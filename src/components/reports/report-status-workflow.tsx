"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Circle, AlertCircle, FileText } from "lucide-react";
import { ReportApprovalPanel } from "./report-approval-panel";
import type { ReportStatus } from "@/actions/reports/schemas";
import {
  REPORT_TRANSITIONS,
  TRANSITION_ROLES,
} from "@/actions/reports/schemas";

interface ReportStatusWorkflowProps {
  engagementId: string;
  currentStatus: ReportStatus;
  reviewedBy: { name: string; at: string } | null;
  approvedBy: { name: string; at: string } | null;
  issuedBy: { name: string; at: string } | null;
  currentUserRoles: string[];
  observationCount: number;
  bhCertSigned: boolean;
  branchName: string;
  overallRating: string | null;
}

const STATUS_ORDER: ReportStatus[] = [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
  "ISSUED",
];

export function ReportStatusWorkflow({
  engagementId,
  currentStatus,
  reviewedBy,
  approvedBy,
  issuedBy,
  currentUserRoles,
  observationCount,
  bhCertSigned,
  branchName,
  overallRating,
}: ReportStatusWorkflowProps) {
  const currentStepIndex = STATUS_ORDER.indexOf(currentStatus);

  // Determine available transitions
  const availableTransitions = REPORT_TRANSITIONS[currentStatus] || [];

  // Check which transitions user can perform
  const userCanTransition = (targetStatus: ReportStatus) => {
    const transitionKey = `${currentStatus}→${targetStatus}`;
    const requiredRoles = TRANSITION_ROLES[transitionKey];
    if (!requiredRoles) return false;
    return currentUserRoles.some((role) => requiredRoles.includes(role));
  };

  // Get pre-condition warnings
  const getPreConditionWarnings = (targetStatus: ReportStatus): string[] => {
    const warnings: string[] = [];

    if (currentStatus === "DRAFT" && targetStatus === "REVIEWED") {
      if (observationCount === 0) {
        warnings.push("At least one observation must exist before review");
      }
    }

    if (currentStatus === "APPROVED" && targetStatus === "ISSUED") {
      if (!bhCertSigned) {
        warnings.push("Branch Head certificate must be signed before issuing");
      }
    }

    return warnings;
  };

  return (
    <div className="space-y-6">
      {/* Status Stepper */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Report Status</h2>
        <div className="flex items-center justify-between">
          {STATUS_ORDER.map((status, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isUpcoming = index > currentStepIndex;

            return (
              <React.Fragment key={status}>
                {/* Step Circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${
                      isCurrent ? "text-blue-600" : "text-gray-600"
                    }`}
                  >
                    {status}
                  </span>
                </div>

                {/* Connector Line */}
                {index < STATUS_ORDER.length - 1 && (
                  <div
                    className={`mx-4 h-1 flex-1 ${
                      isCompleted ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Status Details */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Workflow History</h2>
        <div className="space-y-3">
          {reviewedBy && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Reviewed</p>
                <p className="text-muted-foreground text-sm">
                  By {reviewedBy.name} on {reviewedBy.at}
                </p>
              </div>
            </div>
          )}

          {approvedBy && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Approved</p>
                <p className="text-muted-foreground text-sm">
                  By {approvedBy.name} on {approvedBy.at}
                </p>
              </div>
            </div>
          )}

          {issuedBy && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Issued</p>
                <p className="text-muted-foreground text-sm">
                  By {issuedBy.name} on {issuedBy.at}
                </p>
              </div>
            </div>
          )}

          {!reviewedBy && !approvedBy && !issuedBy && (
            <p className="text-muted-foreground text-sm">
              No workflow actions recorded yet.
            </p>
          )}
        </div>
      </Card>

      {/* Report Summary */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          Report Summary
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground text-sm">Branch</p>
            <p className="font-medium">{branchName}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Observations</p>
            <p className="font-medium">{observationCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Overall Rating</p>
            <p className="font-medium">{overallRating || "Not computed"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">BH Certificate</p>
            <Badge variant={bhCertSigned ? "default" : "secondary"}>
              {bhCertSigned ? "Signed" : "Pending"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Available Actions */}
      {currentStatus !== "ISSUED" && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Available Actions</h2>

          {availableTransitions.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No further transitions available from {currentStatus} status.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {availableTransitions.map((targetStatus) => {
                const canTransition = userCanTransition(targetStatus);
                const warnings = getPreConditionWarnings(targetStatus);
                const hasWarnings = warnings.length > 0;

                return (
                  <div key={targetStatus} className="space-y-2">
                    {hasWarnings && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <ul className="list-inside list-disc">
                            {warnings.map((warning, idx) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {canTransition && (
                      <ReportApprovalPanel
                        engagementId={engagementId}
                        currentStatus={currentStatus}
                        targetStatus={targetStatus}
                        disabled={hasWarnings}
                      />
                    )}

                    {!canTransition && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          You do not have permission to transition to{" "}
                          {targetStatus}. Required roles:{" "}
                          {TRANSITION_ROLES[
                            `${currentStatus}→${targetStatus}`
                          ]?.join(", ")}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Terminal State Message */}
      {currentStatus === "ISSUED" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Report has been issued. No further workflow actions available.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
