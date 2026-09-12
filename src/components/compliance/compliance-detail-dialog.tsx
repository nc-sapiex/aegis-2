"use client";

import * as React from "react";
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
import { FileText } from "@/lib/icons";
import { formatDate } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/constants";
import type { ComplianceRequirement } from "@/types";

const CATEGORY_MAP: Record<string, string> = {
  "risk-management": "Risk Management",
  governance: "Governance",
  operations: "Operations",
  it: "IT",
  credit: "Credit",
  "market-risk": "Market Risk",
};

const EVIDENCE_NAMES = [
  "CRAR Computation Sheet",
  "Board Resolution",
  "RBI Return Filing",
  "Internal Audit Report",
  "Policy Document",
  "Compliance Certificate",
];

const PRIORITY_COLORS = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
} as const;

export interface ComplianceDetailDialogProps {
  requirement: ComplianceRequirement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplianceDetailDialog({
  requirement,
  open,
  onOpenChange,
}: ComplianceDetailDialogProps) {
  if (!requirement) {
    return null;
  }

  const categoryDisplay =
    CATEGORY_MAP[requirement.categoryId] || requirement.categoryId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-sm">
                {requirement.id}
              </span>
              <Badge className={STATUS_COLORS[requirement.status]}>
                {requirement.status.charAt(0).toUpperCase() +
                  requirement.status.slice(1).replace("-", " ")}
              </Badge>
            </div>
            <DialogTitle className="text-xl">{requirement.title}</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {requirement.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Details Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Category
              </div>
              <div>{categoryDisplay}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Priority
              </div>
              <Badge className={PRIORITY_COLORS[requirement.priority]}>
                {requirement.priority.charAt(0).toUpperCase() +
                  requirement.priority.slice(1)}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Assigned To
              </div>
              <div>{requirement.assignedToName}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Due Date
              </div>
              <div>{formatDate(requirement.dueDate)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Last Review
              </div>
              <div>{formatDate(requirement.lastReviewDate)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Next Review
              </div>
              <div>{formatDate(requirement.nextReviewDate)}</div>
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-1">
            <div className="text-muted-foreground text-base font-medium">
              Reference
            </div>
            <div className="font-mono text-base">{requirement.reference}</div>
          </div>

          {/* Notes */}
          {requirement.notes && (
            <div className="space-y-1">
              <div className="text-muted-foreground text-base font-medium">
                Notes
              </div>
              <div className="text-muted-foreground text-base">
                {requirement.notes}
              </div>
            </div>
          )}

          {/* Evidence */}
          <div className="space-y-3">
            <div className="text-base font-medium">
              Evidence ({requirement.evidenceCount} documents)
            </div>
            {requirement.evidenceCount > 0 ? (
              <div className="space-y-2">
                {Array.from({ length: requirement.evidenceCount }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md border p-2 text-base"
                    >
                      <FileText className="text-muted-foreground h-4 w-4" />
                      <span>
                        {EVIDENCE_NAMES[index % EVIDENCE_NAMES.length]}.pdf
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm italic">
                No evidence attached
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
