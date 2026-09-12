"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { generateAnnualPlan } from "@/actions/audit-plans/generate-annual-plan";
import type { BranchAuditSchedule } from "@/data-access/audit-plans";

/**
 * Get fiscal year options (current FY and next 2 FYs).
 */
function getFiscalYearOptions(): string[] {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  const fyYear = month < 3 ? year - 1 : year;

  return [
    `${fyYear}-${String(fyYear + 1).slice(2)}`,
    `${fyYear + 1}-${String(fyYear + 2).slice(2)}`,
    `${fyYear + 2}-${String(fyYear + 3).slice(2)}`,
  ];
}

/**
 * Annual Audit Plan Generator
 *
 * Two-step workflow:
 * 1. Generate Preview: Shows computed schedules without DB writes
 * 2. Commit Plan: Creates AuditPlan + AuditEngagement records
 */
export function PlanGenerator() {
  const fiscalYearOptions = getFiscalYearOptions();
  const [selectedFY, setSelectedFY] = useState(fiscalYearOptions[0]);
  const [preview, setPreview] = useState<BranchAuditSchedule[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Handle preview generation
  const handleGeneratePreview = async () => {
    setIsGenerating(true);
    setPreview(null);

    try {
      const result = await generateAnnualPlan({
        fiscalYear: selectedFY,
        autoCreateEngagements: false, // Preview mode
      });

      if (result.success && result.data.preview) {
        setPreview(result.data.preview);
        toast.success(`Preview generated for FY ${selectedFY}`);
      } else {
        toast.error(result.error || "Failed to generate preview");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle plan commit
  const handleCommitPlan = async () => {
    if (!preview || preview.length === 0) {
      toast.error("No preview to commit");
      return;
    }

    setIsCommitting(true);

    try {
      const result = await generateAnnualPlan({
        fiscalYear: selectedFY,
        autoCreateEngagements: true, // Commit mode
      });

      if (result.success && result.data.planId) {
        toast.success(
          `Annual plan created! ${result.data.engagementsCount} audits scheduled.`,
        );
        setPreview(null); // Clear preview after successful commit
      } else {
        toast.error(result.error || "Failed to commit plan");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsCommitting(false);
    }
  };

  // Get priority badge variant
  const getPriorityVariant = (
    priority: "HIGH" | "MEDIUM" | "LOW",
  ): "destructive" | "default" | "secondary" => {
    if (priority === "HIGH") return "destructive";
    if (priority === "MEDIUM") return "default";
    return "secondary";
  };

  // Get quarter label
  const getQuarterLabel = (quarter: string): string => {
    const labels: Record<string, string> = {
      Q1_APR_JUN: "Q1 (Apr-Jun)",
      Q2_JUL_SEP: "Q2 (Jul-Sep)",
      Q3_OCT_DEC: "Q3 (Oct-Dec)",
      Q4_JAN_MAR: "Q4 (Jan-Mar)",
    };
    return labels[quarter] || quarter;
  };

  return (
    <div className="space-y-6">
      {/* Form section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="fiscalYear" className="text-sm font-medium">
            Fiscal Year
          </label>
          <Select value={selectedFY} onValueChange={setSelectedFY}>
            <SelectTrigger id="fiscalYear" className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYearOptions.map((fy) => (
                <SelectItem key={fy} value={fy}>
                  FY {fy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleGeneratePreview}
            disabled={isGenerating || isCommitting}
            variant="outline"
          >
            {isGenerating ? "Generating..." : "Generate Preview"}
          </Button>

          {preview && preview.length > 0 && (
            <Button
              onClick={handleCommitPlan}
              disabled={isGenerating || isCommitting}
            >
              {isCommitting ? "Committing..." : "Commit Plan"}
            </Button>
          )}
        </div>
      </div>

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch Code</TableHead>
                <TableHead>Branch Name</TableHead>
                <TableHead className="text-right">RAM Score</TableHead>
                <TableHead>Last Audit</TableHead>
                <TableHead>Next Audit</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Quarter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((schedule) => (
                <TableRow key={schedule.branchId}>
                  <TableCell className="font-medium">
                    {schedule.branchCode}
                  </TableCell>
                  <TableCell>{schedule.branchName}</TableCell>
                  <TableCell className="text-right">
                    {schedule.ramScore ? schedule.ramScore.toFixed(2) : "N/A"}
                  </TableCell>
                  <TableCell>
                    {schedule.lastAuditDate
                      ? format(new Date(schedule.lastAuditDate), "PP")
                      : "Never"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {format(new Date(schedule.nextAuditDate), "PP")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityVariant(schedule.priority)}>
                      {schedule.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getQuarterLabel(schedule.quarterAssigned)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {preview && preview.length === 0 && (
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No branches found to schedule
        </div>
      )}
    </div>
  );
}
