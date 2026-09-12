"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createRamAssessment } from "@/actions/ram/create-assessment";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "@/lib/icons";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { toast } from "sonner";

interface RamAssessmentsTableProps {
  assessments: Array<{
    id: string;
    assessmentYear: string;
    compositeScore: any;
    riskCategory: string | null;
    auditFrequency: number | null;
    status: string;
    branch: { id: string; code: string; name: string; city: string } | null;
  }>;
  canCreate: boolean;
  allBranches?: Array<{ id: string; code: string; name: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 border-gray-300",
  COMPUTED: "bg-blue-100 text-blue-800 border-blue-300",
  APPROVED: "bg-green-100 text-green-800 border-green-300",
};

const RISK_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export function RamAssessmentsTable({
  assessments,
  canCreate,
  allBranches = [],
}: RamAssessmentsTableProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedBranchId, setSelectedBranchId] = React.useState("");
  const [assessmentYear, setAssessmentYear] = React.useState(
    new Date().getFullYear().toString(),
  );

  async function handleCreate() {
    if (!selectedBranchId || !assessmentYear) {
      toast.error("Please select a branch and enter a year");
      return;
    }

    setIsSubmitting(true);
    const result = await createRamAssessment({
      branchId: selectedBranchId,
      assessmentYear,
    });
    setIsSubmitting(false);

    if (result.success) {
      toast.success("RAM assessment created successfully");
      setDialogOpen(false);
      setSelectedBranchId("");
      router.push(`/ram/${result.data.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Assessment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create RAM Assessment</DialogTitle>
                <DialogDescription>
                  Create a new Risk Assessment Model evaluation for a branch.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Select
                    value={selectedBranchId}
                    onValueChange={setSelectedBranchId}
                  >
                    <SelectTrigger id="branch">
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {allBranches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.code} — {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Assessment Year</Label>
                  <Input
                    id="year"
                    type="number"
                    min="2020"
                    max="2099"
                    value={assessmentYear}
                    onChange={(e) => setAssessmentYear(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Composite Score</TableHead>
              <TableHead>Risk Category</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assessments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyStateCard
                    variant="inline"
                    title="No RAM assessments found"
                    message="Create a new Risk Assessment Model evaluation for a branch to get started."
                  />
                </TableCell>
              </TableRow>
            ) : (
              assessments.map((assessment) => (
                <TableRow
                  key={assessment.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/ram/${assessment.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/ram/${assessment.id}`);
                    }
                  }}
                >
                  <TableCell className="font-medium">
                    {assessment.branch?.name ?? "—"}
                  </TableCell>
                  <TableCell>{assessment.assessmentYear}</TableCell>
                  <TableCell>
                    {assessment.compositeScore
                      ? Number(assessment.compositeScore).toFixed(2)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {assessment.riskCategory ? (
                      <Badge
                        variant="outline"
                        className={RISK_COLORS[assessment.riskCategory] ?? ""}
                      >
                        {assessment.riskCategory}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {assessment.auditFrequency
                      ? `${assessment.auditFrequency} months`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[assessment.status] ?? ""}
                    >
                      {assessment.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
