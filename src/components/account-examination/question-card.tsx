"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lightbulb,
  Paperclip,
} from "@/lib/icons";
import { saveAccountExamResponse } from "@/actions/account-examination/save-response";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionCardQuestion {
  id: string;
  text: string;
  rbiReference: string | null;
  bestPracticeTip: string | null;
  category: string | null;
  weight: number;
  isCritical: boolean;
  response: {
    id: string;
    status: "COMPLIANT" | "VIOLATION";
    note: string | null;
  } | null;
}

interface QuestionCardProps {
  question: QuestionCardQuestion;
  engagementId: string;
  loanAccountId: string;
  canRespond: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Individual examination question card with compliance marking, RBI guidance,
 * best practice tips, expandable notes with auto-save debounce, and evidence upload.
 *
 * UI behaviour (per CONTEXT.md — LOCKED):
 * - Two large compliance buttons: Compliant (green) / Violation (red)
 * - Card border turns red when marked VIOLATION, subtle green when COMPLIANT
 * - RBI Reference section: collapsed by default, collapsible on click
 * - Best Practice section: collapsed by default, collapsible on click
 * - Notes section: collapsed by default, auto-expands on VIOLATION selection
 * - Notes auto-save with 500ms debounce
 * - Evidence section: visible only when a response exists (needs responseId)
 *
 * AEXM-02: Collapsible RBI reference and best practice panels
 * AEXM-03: Immediate compliance marking saved via server action
 * AEXM-04: Expandable notes with auto-save debounce
 */
export function QuestionCard({
  question,
  engagementId,
  loanAccountId,
  canRespond,
}: QuestionCardProps) {
  // ── Local state ────────────────────────────────────────────────────────────
  const [currentStatus, setCurrentStatus] = useState<
    "COMPLIANT" | "VIOLATION" | null
  >(question.response?.status ?? null);
  const [currentResponseId, setCurrentResponseId] = useState<string | null>(
    question.response?.id ?? null,
  );
  const [noteText, setNoteText] = useState<string>(
    question.response?.note ?? "",
  );
  const [noteExpanded, setNoteExpanded] = useState<boolean>(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState<boolean>(false);
  const [rbiExpanded, setRbiExpanded] = useState<boolean>(false);
  const [bestPracticeExpanded, setBestPracticeExpanded] =
    useState<boolean>(false);
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);
  const [pendingStatus, setPendingStatus] = useState<
    "COMPLIANT" | "VIOLATION" | null
  >(null);

  const [isPending, startTransition] = useTransition();

  // ── Auto-expand notes on VIOLATION selection ──────────────────────────────
  useEffect(() => {
    if (currentStatus === "VIOLATION") {
      setNoteExpanded(true);
    }
  }, [currentStatus]);

  // ── Debounced note auto-save ──────────────────────────────────────────────
  const saveNote = useCallback(
    (note: string, status: "COMPLIANT" | "VIOLATION") => {
      if (!canRespond) {
        toast.error(
          "You do not have permission to record examination responses.",
        );
        return;
      }
      setIsSavingNote(true);
      saveAccountExamResponse({
        engagementId,
        loanAccountId,
        questionId: question.id,
        status,
        note: note || null,
      })
        .then((result) => {
          if (!result.success) {
            toast.error(`Failed to save note: ${result.error}`);
          } else if (result.data) {
            setCurrentResponseId(result.data.id);
          }
        })
        .catch(() => {
          toast.error("Failed to save note");
        })
        .finally(() => {
          setIsSavingNote(false);
        });
    },
    [canRespond, engagementId, loanAccountId, question.id],
  );

  // Debounce note saves — 500ms after last keystroke
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const handleNoteChange = useCallback(
    (value: string) => {
      setNoteText(value);

      // Only save if we have a current status
      if (!currentStatus) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        saveNote(value, currentStatus);
      }, 500);
      setDebounceTimer(timer);
    },
    [currentStatus, debounceTimer, saveNote],
  );

  // ── Compliance button handler ──────────────────────────────────────────────
  const handleComplianceClick = useCallback(
    (status: "COMPLIANT" | "VIOLATION") => {
      if (!canRespond) {
        toast.error(
          "You do not have permission to record examination responses.",
        );
        return;
      }
      const previousStatus = currentStatus;
      setPendingStatus(status);
      // Optimistic update
      setCurrentStatus(status);

      startTransition(async () => {
        const result = await saveAccountExamResponse({
          engagementId,
          loanAccountId,
          questionId: question.id,
          status,
          note: noteText || null,
        });

        setPendingStatus(null);

        if (!result.success) {
          // Revert optimistic update
          setCurrentStatus(previousStatus);
          toast.error(`Failed to save response: ${result.error}`);
        } else {
          if (result.data) {
            setCurrentResponseId(result.data.id);
          }
          toast.success("Response saved");
        }
      });
    },
    [
      canRespond,
      currentStatus,
      engagementId,
      loanAccountId,
      question.id,
      noteText,
      startTransition,
    ],
  );

  // ── Border class based on current status ──────────────────────────────────
  const cardBorderClass =
    currentStatus === "VIOLATION"
      ? "border-red-500 border-2"
      : currentStatus === "COMPLIANT"
        ? "border-green-500/50 border"
        : "";

  return (
    <Card className={cn("transition-all duration-200", cardBorderClass)}>
      {/* Question header */}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed">{question.text}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {question.isCritical && (
              <Badge variant="destructive" className="text-xs">
                Critical
              </Badge>
            )}
            {question.category && (
              <Badge variant="outline" className="text-xs">
                {question.category}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* RBI Reference — collapsible panel (AEXM-02) */}
        {question.rbiReference && (
          <Collapsible open={rbiExpanded} onOpenChange={setRbiExpanded}>
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors">
              {rbiExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              RBI Reference
            </CollapsibleTrigger>
            <CollapsibleContent>
              {rbiExpanded && (
                <div className="mt-2 rounded-md bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  {question.rbiReference}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Best Practice Tip — collapsible panel (AEXM-02) */}
        {question.bestPracticeTip && (
          <Collapsible
            open={bestPracticeExpanded}
            onOpenChange={setBestPracticeExpanded}
          >
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors">
              {bestPracticeExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              Best Practice
            </CollapsibleTrigger>
            <CollapsibleContent>
              {bestPracticeExpanded && (
                <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {question.bestPracticeTip}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Compliance buttons (AEXM-03) */}
        <div className="flex gap-3 pt-1">
          <Button
            variant={currentStatus === "COMPLIANT" ? "default" : "outline"}
            className={cn(
              "h-12 flex-1 text-base font-medium",
              currentStatus === "COMPLIANT"
                ? "bg-green-600 text-white hover:bg-green-700"
                : "hover:border-green-300 hover:bg-green-50 hover:text-green-700",
            )}
            onClick={() => handleComplianceClick("COMPLIANT")}
            disabled={isPending || !canRespond}
          >
            {isPending && pendingStatus === "COMPLIANT" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Compliant
          </Button>
          <Button
            variant={currentStatus === "VIOLATION" ? "default" : "outline"}
            className={cn(
              "h-12 flex-1 text-base font-medium",
              currentStatus === "VIOLATION"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "hover:border-red-300 hover:bg-red-50 hover:text-red-700",
            )}
            onClick={() => handleComplianceClick("VIOLATION")}
            disabled={isPending || !canRespond}
          >
            {isPending && pendingStatus === "VIOLATION" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <AlertTriangle className="mr-2 h-4 w-4" />
            )}
            Violation
          </Button>
        </div>

        {/* Notes section — expandable with auto-save debounce (AEXM-04) */}
        <Collapsible open={noteExpanded} onOpenChange={setNoteExpanded}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors">
            {noteExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Notes
            {noteText && (
              <span className="text-muted-foreground font-normal">
                {" "}
                (added)
              </span>
            )}
            {isSavingNote && (
              <span className="text-muted-foreground font-normal italic">
                {" "}
                Saving...
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {noteExpanded && (
              <div className="mt-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder={
                    currentStatus === "VIOLATION"
                      ? "Note required for violations — describe the finding..."
                      : "Add notes (optional)..."
                  }
                  className="min-h-[80px] resize-none text-sm"
                  disabled={!currentStatus || !canRespond}
                />
                {!currentStatus && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Mark Compliant or Violation before adding notes.
                  </p>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Evidence attachment — only shown when a response exists (AEXM-04) */}
        {currentResponseId && (
          <Collapsible
            open={evidenceExpanded}
            onOpenChange={setEvidenceExpanded}
          >
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors">
              {evidenceExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Paperclip className="h-3.5 w-3.5" />
              Attach Evidence
            </CollapsibleTrigger>
            <CollapsibleContent>
              {evidenceExpanded && (
                <div className="mt-2 rounded-md border border-dashed p-3 text-center">
                  <p className="text-muted-foreground text-xs">
                    Evidence upload for account examination responses will be
                    available in a future phase.
                  </p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    Response ID: {currentResponseId}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
