"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, CheckCircle2 } from "@/lib/icons";
import type { BmResponseActionPointData } from "@/data-access/rbia-bm-response";
import { BmEvidenceUploadPanel } from "@/components/rbia/bm-evidence-upload-panel";

interface BmResponseApCardProps {
  actionPoint: BmResponseActionPointData;
  responseText: string;
  onResponseChange: (apId: string, text: string) => void;
  engagementId: string;
}

// ---- Severity badge helper ----

function getSeverityStyle(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "MEDIUM":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "LOW":
      return "border-green-200 bg-green-50 text-green-700";
    default:
      return "";
  }
}

function getStatusStyle(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "BM_RESPONDED":
      return {
        label: "Responded",
        className: "border-green-200 bg-green-50 text-green-700",
      };
    case "BM_RESPONSE_DUE":
      return {
        label: "Response Due",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "ISSUED":
      return {
        label: "Issued",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    default:
      return { label: status, className: "" };
  }
}

/**
 * Per-AP response card with inline form and evidence upload zone.
 *
 * Shows AP header (serial, title, severity, module, status) with an
 * expandable response form containing a textarea and evidence attachment button.
 * Pre-fills response text if the AP has already been responded to from DB.
 */
export function BmResponseApCard({
  actionPoint,
  responseText,
  onResponseChange,
  engagementId,
}: BmResponseApCardProps) {
  const [expanded, setExpanded] = useState(
    // Auto-expand if not yet responded
    actionPoint.status !== "BM_RESPONDED",
  );

  const isResponded = actionPoint.status === "BM_RESPONDED";
  const hasResponse = responseText.trim().length > 0;
  const severityStyle = getSeverityStyle(actionPoint.severity);
  const statusInfo = getStatusStyle(actionPoint.status);

  return (
    <Card
      className={
        isResponded || hasResponse
          ? "border-green-200 bg-green-50/20"
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Serial number badge */}
            <span className="bg-muted inline-flex h-7 w-12 items-center justify-center rounded-md text-xs font-bold">
              AP-{String(actionPoint.serialNo).padStart(3, "0")}
            </span>
            <CardTitle className="text-sm leading-tight font-semibold">
              {actionPoint.title}
            </CardTitle>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Responded checkmark */}
            {(isResponded || hasResponse) && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {/* Severity */}
            <Badge className={severityStyle}>{actionPoint.severity}</Badge>
            {/* Module code */}
            <Badge variant="outline" className="text-xs">
              {actionPoint.moduleCode}
            </Badge>
            {/* Status */}
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Description */}
        <p className="text-muted-foreground text-sm leading-relaxed">
          {actionPoint.description}
        </p>

        {/* Expand/collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1.5 h-4 w-4" />
              Hide Response Form
            </>
          ) : (
            <>
              <ChevronDown className="mr-1.5 h-4 w-4" />
              {isResponded ? "View Response" : "Write Response"}
            </>
          )}
        </Button>

        {/* Response form (expandable) */}
        {expanded && (
          <div className="space-y-3 border-t pt-3">
            <Textarea
              placeholder="Enter your response to this action point..."
              value={responseText}
              onChange={(e) => onResponseChange(actionPoint.id, e.target.value)}
              disabled={isResponded}
              rows={4}
              className="resize-y"
            />

            {/* Evidence upload zone */}
            <BmEvidenceUploadPanel
              actionPointId={actionPoint.id}
              engagementId={engagementId}
              disabled={isResponded}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
