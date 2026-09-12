"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle, Clock, FileCheck } from "lucide-react";
import { BhSignatureCapture } from "./bh-signature-capture";
import {
  signBhCertificate,
  countersignBhCertificate,
} from "@/actions/audit-execution/bh-certificate";
import { format } from "date-fns";

interface ObservationSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface SignedBy {
  name: string;
  signedAt: string;
}

interface BhCertificateWorkflowProps {
  engagementId: string;
  currentStatus: "PENDING" | "SIGNED" | "COUNTERSIGNED";
  signedBy: SignedBy | null;
  countersignedBy: SignedBy | null;
  comments: string | null;
  currentUserRole: string[];
  currentUserName: string;
  observationSummary: ObservationSummary;
}

const STEP_CONFIG = [
  { key: "PENDING", label: "Pending Signature", icon: Circle },
  { key: "SIGNED", label: "Signed", icon: CheckCircle2 },
  { key: "COUNTERSIGNED", label: "Countersigned", icon: FileCheck },
];

export function BhCertificateWorkflow({
  engagementId,
  currentStatus,
  signedBy,
  countersignedBy,
  comments,
  currentUserRole,
  currentUserName,
  observationSummary,
}: BhCertificateWorkflowProps) {
  const [isPending, startTransition] = useTransition();
  const [countersignComments, setCountersignComments] = useState("");

  const isBranchHead = currentUserRole.includes("BRANCH_HEAD");
  const isLeadAuditor =
    currentUserRole.includes("LEAD_AUDITOR") ||
    currentUserRole.includes("AUDIT_MANAGER");

  const handleSign = (signComments: string) => {
    startTransition(async () => {
      const result = await signBhCertificate({
        engagementId,
        comments: signComments,
        declarationAccepted: true,
      });

      if (result.success) {
        toast.success("BH Certificate signed successfully");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleCountersign = () => {
    startTransition(async () => {
      const result = await countersignBhCertificate({
        engagementId,
        comments: countersignComments || undefined,
      });

      if (result.success) {
        toast.success("BH Certificate countersigned successfully");
        setCountersignComments("");
      } else {
        toast.error(result.error);
      }
    });
  };

  // Determine current step index
  const currentStepIndex = STEP_CONFIG.findIndex(
    (step) => step.key === currentStatus,
  );

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <Card className="p-6">
        <h3 className="text-muted-foreground mb-4 text-sm font-medium">
          Workflow Progress
        </h3>
        <div className="flex items-center justify-between">
          {STEP_CONFIG.map((step, index) => {
            const Icon = step.icon;
            const isActive = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;

            return (
              <div key={step.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`rounded-full p-2 ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p
                    className={`mt-2 text-center text-xs ${
                      isCurrent ? "font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
                {index < STEP_CONFIG.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 ${
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Observation Summary */}
      <Card className="p-6">
        <h3 className="text-muted-foreground mb-4 text-sm font-medium">
          Audit Findings Summary
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="text-center">
            <p className="text-2xl font-bold">{observationSummary.total}</p>
            <p className="text-muted-foreground text-xs">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {observationSummary.critical}
            </p>
            <p className="text-muted-foreground text-xs">Critical</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {observationSummary.high}
            </p>
            <p className="text-muted-foreground text-xs">High</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {observationSummary.medium}
            </p>
            <p className="text-muted-foreground text-xs">Medium</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {observationSummary.low}
            </p>
            <p className="text-muted-foreground text-xs">Low</p>
          </div>
        </div>
      </Card>

      {/* Status-Based Rendering */}
      {currentStatus === "PENDING" && (
        <>
          {isBranchHead ? (
            <BhSignatureCapture
              signerName={currentUserName}
              onSign={handleSign}
              disabled={isPending}
              isPending={isPending}
            />
          ) : (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Awaiting Branch Head signature. Only the Branch Head can sign
                the BH Certificate.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {currentStatus === "SIGNED" && (
        <div className="space-y-4">
          {/* Signed Details */}
          <Card className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Certificate Signed
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Signed by {signedBy?.name} on{" "}
                  {signedBy?.signedAt &&
                    format(new Date(signedBy.signedAt), "PPp")}
                </p>
              </div>
              <Badge variant="outline" className="bg-green-50">
                Signed
              </Badge>
            </div>

            {comments && (
              <div className="bg-muted/50 mt-4 rounded-md p-4">
                <p className="mb-2 text-sm font-medium">
                  Branch Head Comments:
                </p>
                <p className="text-muted-foreground text-sm">{comments}</p>
              </div>
            )}
          </Card>

          {/* Countersign Section */}
          {isLeadAuditor ? (
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-semibold">
                Countersign Certificate
              </h3>
              <p className="text-muted-foreground mb-4 text-sm">
                As the Lead Auditor or Audit Manager, you can countersign this
                certificate to complete the workflow.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="countersign-comments">
                    Comments (Optional)
                  </Label>
                  <Textarea
                    id="countersign-comments"
                    placeholder="Add any additional comments..."
                    value={countersignComments}
                    onChange={(e) => setCountersignComments(e.target.value)}
                    disabled={isPending}
                    className="min-h-[80px]"
                    maxLength={2000}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleCountersign}
                    disabled={isPending}
                    size="lg"
                  >
                    {isPending
                      ? "Countersigning..."
                      : "Countersign Certificate"}
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Awaiting Lead Auditor or Audit Manager countersignature to
                complete the workflow.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {currentStatus === "COUNTERSIGNED" && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <FileCheck className="h-5 w-5 text-green-600" />
                Certificate Completed
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                The BH Certificate has been fully signed and countersigned.
              </p>
            </div>

            {/* Signed Details */}
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <p className="mb-2 text-sm font-medium">Branch Head Signature:</p>
              <p className="text-sm">
                <strong>{signedBy?.name}</strong> on{" "}
                {signedBy?.signedAt &&
                  format(new Date(signedBy.signedAt), "PPp")}
              </p>
              {comments && (
                <div className="mt-3 border-t border-green-300 pt-3">
                  <p className="mb-1 text-sm font-medium">Comments:</p>
                  <p className="text-muted-foreground text-sm">{comments}</p>
                </div>
              )}
            </div>

            {/* Countersigned Details */}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-sm font-medium">
                Lead Auditor Countersignature:
              </p>
              <p className="text-sm">
                <strong>{countersignedBy?.name}</strong> on{" "}
                {countersignedBy?.signedAt &&
                  format(new Date(countersignedBy.signedAt), "PPp")}
              </p>
            </div>

            <Alert>
              <FileCheck className="h-4 w-4" />
              <AlertDescription>
                This certificate is now complete and will be included in the
                final audit report PDF.
              </AlertDescription>
            </Alert>
          </div>
        </Card>
      )}
    </div>
  );
}
