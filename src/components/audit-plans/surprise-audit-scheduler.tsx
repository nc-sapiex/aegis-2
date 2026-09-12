"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, EyeOff, ShieldAlert } from "lucide-react";
import { scheduleSurpriseAudit } from "@/actions/audit-plans/schedule-surprise-audit";

type Branch = {
  id: string;
  code: string;
  name: string;
};

type AuditPlan = {
  id: string;
  year: number;
  quarter: string;
};

type TeamMember = {
  id: string;
  name: string;
};

interface SurpriseAuditSchedulerProps {
  branches: Branch[];
  auditPlans: AuditPlan[];
  teamMembers?: TeamMember[];
}

/**
 * Surprise Audit Scheduler (R71)
 *
 * Allows authorized users (IAD Manager, ACE Officer) to schedule
 * unannounced audits. Branch is not notified in advance.
 * Engagement details are restricted visibility.
 */
export function SurpriseAuditScheduler({
  branches,
  auditPlans,
  teamMembers = [],
}: SurpriseAuditSchedulerProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedTeamLead, setSelectedTeamLead] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [justification, setJustification] = useState("");
  const [scope, setScope] = useState("");
  const [confidentiality, setConfidentiality] = useState<
    "STANDARD" | "RESTRICTED" | "HIGHLY_RESTRICTED"
  >("RESTRICTED");

  const handleSubmit = async () => {
    if (
      !selectedBranch ||
      !selectedPlan ||
      !scheduledDate ||
      !justification ||
      !scope
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await scheduleSurpriseAudit({
        auditPlanId: selectedPlan,
        branchId: selectedBranch,
        scheduledDate,
        justification,
        scope,
        confidentialityLevel: confidentiality,
        ...(selectedTeamLead && { teamLeadId: selectedTeamLead }),
      });

      if (result.success && result.data) {
        toast.success(`Surprise audit scheduled: ${result.data.auditNumber}`);
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error || "Failed to schedule surprise audit.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedBranch("");
    setSelectedPlan("");
    setSelectedTeamLead("");
    setScheduledDate("");
    setJustification("");
    setScope("");
    setConfidentiality("RESTRICTED");
  };

  const getConfidentialityColor = (level: string) => {
    switch (level) {
      case "HIGHLY_RESTRICTED":
        return "destructive";
      case "RESTRICTED":
        return "default";
      default:
        return "secondary";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          Surprise Audit Scheduling
        </CardTitle>
        <CardDescription>
          Schedule unannounced audits. Branch personnel are NOT notified until
          the audit team arrives. Restricted visibility applies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex-1 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              <EyeOff className="h-4 w-4" />
              Confidential
            </div>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Surprise audit details are hidden from branch-level users. Only
              the assigned team and approving authority can view scheduling
              details.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="whitespace-nowrap">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Schedule Surprise Audit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Schedule Surprise Audit</DialogTitle>
                <DialogDescription>
                  This creates a confidential audit engagement. The branch will
                  not be notified.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Audit Plan */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Audit Plan *</label>
                  <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select audit plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {auditPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          FY {plan.year}-{String(plan.year + 1).slice(2)} (
                          {plan.quarter})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Branch */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Branch *</label>
                  <Select
                    value={selectedBranch}
                    onValueChange={setSelectedBranch}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.code} — {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Team Lead */}
                {teamMembers.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Team Lead</label>
                    <Select
                      value={selectedTeamLead}
                      onValueChange={setSelectedTeamLead}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team lead (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Scheduled Date */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Scheduled Date *
                  </label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>

                {/* Justification */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Justification *</label>
                  <Textarea
                    placeholder="Why is a surprise audit needed? (e.g., whistleblower tip, anomaly in MIS, repeat non-compliance)"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Scope */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Audit Scope *</label>
                  <Textarea
                    placeholder="Define scope: areas to examine, focus items, specific accounts or transactions"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Confidentiality Level */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Confidentiality Level
                  </label>
                  <Select
                    value={confidentiality}
                    onValueChange={(v) =>
                      setConfidentiality(
                        v as "STANDARD" | "RESTRICTED" | "HIGHLY_RESTRICTED",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">Standard</SelectItem>
                      <SelectItem value="RESTRICTED">Restricted</SelectItem>
                      <SelectItem value="HIGHLY_RESTRICTED">
                        Highly Restricted
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge
                    variant={getConfidentialityColor(confidentiality) as any}
                  >
                    {confidentiality.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  variant="destructive"
                >
                  {isSubmitting ? "Scheduling..." : "Confirm & Schedule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
