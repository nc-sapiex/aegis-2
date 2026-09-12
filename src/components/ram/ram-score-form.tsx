"use client";

import * as React from "react";
import { saveRamScores } from "@/actions/ram/save-scores";
import { computeRamAssessment } from "@/actions/ram/compute-assessment";
import { approveRamAssessment } from "@/actions/ram/approve-assessment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Save, Loader2, CheckCircle2 } from "@/lib/icons";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface RamScoreFormProps {
  assessmentId: string;
  allParams: Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    weight: any;
    maxScore: any;
    scoringCriteria: any;
    displayOrder: number;
  }>;
  existingScores: Array<{
    paramConfig: {
      id: string;
      code: string;
      name: string;
      category: string;
      weight: any;
      maxScore: any;
      scoringCriteria: any;
      displayOrder: number;
    };
    score: any;
    remarks: string | null;
  }>;
  canEdit: boolean;
  canCompute: boolean;
  canApprove: boolean;
  status: string;
}

export function RamScoreForm({
  assessmentId,
  allParams,
  existingScores,
  canEdit,
  canCompute,
  canApprove,
  status,
}: RamScoreFormProps) {
  const router = useRouter();
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isComputing, setIsComputing] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);

  // Initialize scores from existing data
  React.useEffect(() => {
    const initialScores: Record<string, number> = {};
    const initialRemarks: Record<string, string> = {};
    for (const score of existingScores) {
      initialScores[score.paramConfig.id] = Number(score.score);
      if (score.remarks) {
        initialRemarks[score.paramConfig.id] = score.remarks;
      }
    }
    setScores(initialScores);
    setRemarks(initialRemarks);
  }, [existingScores]);

  // Group parameters by category
  const businessParams = allParams.filter(
    (p) => p.category === "BUSINESS_RISK",
  );
  const controlParams = allParams.filter((p) => p.category === "CONTROL_RISK");

  async function handleSave() {
    const scoreInputs = Object.entries(scores).map(
      ([paramConfigId, score]) => ({
        paramConfigId,
        score,
        remarks: remarks[paramConfigId] || undefined,
      }),
    );

    if (scoreInputs.length === 0) {
      toast.error("Please score at least one parameter");
      return;
    }

    setIsSaving(true);
    const result = await saveRamScores({ assessmentId, scores: scoreInputs });
    setIsSaving(false);

    if (result.success) {
      toast.success("Scores saved successfully");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleCompute() {
    setIsComputing(true);
    const result = await computeRamAssessment({ assessmentId });
    setIsComputing(false);

    if (result.success) {
      toast.success(
        `Computed: ${result.data.riskCategory} risk (${result.data.compositeScore.toFixed(2)})`,
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleApprove() {
    setIsApproving(true);
    const result = await approveRamAssessment({ assessmentId });
    setIsApproving(false);

    if (result.success) {
      toast.success("Assessment approved successfully");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function renderParameterGroup(
    params: typeof allParams,
    title: string,
    description: string,
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {params.map((param) => (
            <div
              key={param.id}
              className="space-y-3 border-b pb-4 last:border-0"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Label className="text-base font-medium">{param.name}</Label>
                  <p className="text-muted-foreground text-sm">
                    Weight: {Number(param.weight).toFixed(2)} | Max Score:{" "}
                    {Number(param.maxScore)}
                  </p>
                </div>
              </div>

              {/* Scoring criteria (expandable) */}
              {param.scoringCriteria && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="criteria" className="border-0">
                    <AccordionTrigger className="py-2 text-sm">
                      View Scoring Criteria
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-muted rounded-md p-3 text-sm">
                        {typeof param.scoringCriteria === "string"
                          ? param.scoringCriteria
                          : JSON.stringify(param.scoringCriteria)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Score selector (1-5) */}
              <div className="space-y-2">
                <Label>Score (1-5)</Label>
                <RadioGroup
                  value={scores[param.id]?.toString() || ""}
                  onValueChange={(value) =>
                    setScores({ ...scores, [param.id]: parseInt(value) })
                  }
                  disabled={!canEdit || status === "APPROVED"}
                  className="flex gap-4"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={value.toString()}
                        id={`${param.id}-${value}`}
                      />
                      <Label
                        htmlFor={`${param.id}-${value}`}
                        className="cursor-pointer font-normal"
                      >
                        {value}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor={`remarks-${param.id}`}>
                  Remarks (optional)
                </Label>
                <Textarea
                  id={`remarks-${param.id}`}
                  value={remarks[param.id] || ""}
                  onChange={(e) =>
                    setRemarks({ ...remarks, [param.id]: e.target.value })
                  }
                  disabled={!canEdit || status === "APPROVED"}
                  placeholder="Add notes or justification for this score..."
                  rows={2}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Business Risk Parameters */}
      {renderParameterGroup(
        businessParams,
        "Business Risk Parameters",
        "Factors related to the branch's operational environment and business profile",
      )}

      {/* Control Risk Parameters */}
      {renderParameterGroup(
        controlParams,
        "Control Risk Parameters",
        "Factors related to the branch's internal controls and compliance",
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {canEdit && status === "DRAFT" && (
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isSaving && <Save className="mr-2 h-4 w-4" />}
            Save Scores
          </Button>
        )}

        {canCompute && status === "DRAFT" && (
          <Button
            onClick={handleCompute}
            disabled={isComputing}
            variant="secondary"
          >
            {isComputing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Compute Assessment
          </Button>
        )}

        {canApprove && status === "COMPUTED" && (
          <Button onClick={handleApprove} disabled={isApproving}>
            {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isApproving && <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve Assessment
          </Button>
        )}

        {status === "APPROVED" && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Assessment Approved</span>
          </div>
        )}
      </div>
    </div>
  );
}
