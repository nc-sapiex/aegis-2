"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Pencil,
  Archive,
  RotateCcw,
  Loader2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from "@/lib/icons";
import {
  deactivateQuestion,
  reactivateQuestion,
} from "@/actions/examination-questions/manage-questions";
import { EditQuestionDialog } from "./edit-question-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string;
  text: string;
  rbiReference: string | null;
  bestPracticeTip: string | null;
  category: string | null;
  weight: number;
  isCritical: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string; // ISO string (serialized from server)
  _count: { accountExamResponses: number };
}

interface QuestionTableProps {
  questions: QuestionRow[];
  moduleCode: string;
  engagementId: string;
}

type SortKey = "displayOrder" | "text" | "weight" | "category";
type SortDir = "asc" | "desc";

// ─── Sort icon helper ─────────────────────────────────────────────────────────

function SortIcon({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (column !== sortKey)
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
  if (sortDir === "asc") return <ChevronUp className="ml-1 inline h-3 w-3" />;
  return <ChevronDown className="ml-1 inline h-3 w-3" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Sortable table of examination questions for a credit module.
 *
 * Features:
 * - Client-side sorting by any column
 * - Toggle to show/hide inactive questions
 * - Inactive questions displayed with strikethrough + Inactive badge
 * - Edit button (pencil) opens EditQuestionDialog
 * - Deactivate button (archive): warns if question has responses, deactivates with toast
 * - Reactivate button (undo): reactivates inactive questions with toast
 * - Empty state when no questions exist
 *
 * Requirements: QMGT-02, QMGT-03
 */
export function QuestionTable({
  questions,
  moduleCode: _moduleCode,
  engagementId,
}: QuestionTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("displayOrder");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Edit dialog state
  const [editQuestion, setEditQuestion] = useState<QuestionRow | null>(null);

  // Deactivate confirm dialog state
  const [deactivateTarget, setDeactivateTarget] = useState<QuestionRow | null>(
    null,
  );

  // ── Sort handler ──────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const visible = questions
    .filter((q) => showInactive || q.isActive)
    .sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      switch (sortKey) {
        case "text":
          valA = a.text.toLowerCase();
          valB = b.text.toLowerCase();
          break;
        case "weight":
          valA = a.weight;
          valB = b.weight;
          break;
        case "category":
          valA = (a.category ?? "").toLowerCase();
          valB = (b.category ?? "").toLowerCase();
          break;
        default:
          valA = a.displayOrder;
          valB = b.displayOrder;
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  // ── Deactivate ────────────────────────────────────────────────────────────

  function handleDeactivateClick(q: QuestionRow) {
    if (q._count.accountExamResponses > 0) {
      // Has responses — show confirmation dialog
      setDeactivateTarget(q);
    } else {
      // No responses — deactivate immediately
      handleDeactivateConfirm(q);
    }
  }

  function handleDeactivateConfirm(q: QuestionRow) {
    setDeactivateTarget(null);
    setPendingId(q.id);
    startTransition(async () => {
      const result = await deactivateQuestion({ questionId: q.id });
      setPendingId(null);
      if (result.success) {
        toast.success("Question deactivated");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to deactivate question");
      }
    });
  }

  // ── Reactivate ────────────────────────────────────────────────────────────

  function handleReactivate(q: QuestionRow) {
    setPendingId(q.id);
    startTransition(async () => {
      const result = await reactivateQuestion({ questionId: q.id });
      setPendingId(null);
      if (result.success) {
        toast.success("Question reactivated");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to reactivate question");
      }
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (questions.length === 0) {
    return (
      <div className="border-border rounded-lg border py-12 text-center">
        <p className="text-muted-foreground text-sm">
          No questions found for this module. Add the first question to get
          started.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Show/hide inactive toggle */}
      <div className="flex items-center gap-2">
        <Switch
          id="show-inactive"
          checked={showInactive}
          onCheckedChange={setShowInactive}
        />
        <Label
          htmlFor="show-inactive"
          className="text-muted-foreground text-sm"
        >
          Show inactive questions
          {!showInactive && questions.some((q) => !q.isActive) && (
            <span className="ml-1 text-xs">
              ({questions.filter((q) => !q.isActive).length} hidden)
            </span>
          )}
        </Label>
      </div>

      {/* Question table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-12 cursor-pointer select-none"
                onClick={() => handleSort("displayOrder")}
              >
                #
                <SortIcon
                  column="displayOrder"
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("text")}
              >
                Question Text
                <SortIcon column="text" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none"
                onClick={() => handleSort("category")}
              >
                Category
                <SortIcon
                  column="category"
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </TableHead>
              <TableHead
                className="w-20 cursor-pointer select-none"
                onClick={() => handleSort("weight")}
              >
                Weight
                <SortIcon column="weight" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="w-24">Critical</TableHead>
              <TableHead className="w-36">RBI Ref</TableHead>
              <TableHead className="w-24">Responses</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  No active questions. Toggle "Show inactive" to view
                  deactivated questions.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((q) => (
                <TableRow
                  key={q.id}
                  className={!q.isActive ? "opacity-60" : undefined}
                >
                  {/* # */}
                  <TableCell className="text-muted-foreground text-xs">
                    {q.displayOrder + 1}
                  </TableCell>

                  {/* Question text */}
                  <TableCell className="max-w-xs">
                    <div className="flex items-start gap-2">
                      <span
                        className={
                          !q.isActive
                            ? "text-muted-foreground line-through"
                            : "text-sm"
                        }
                        title={q.text}
                      >
                        {q.text.length > 120
                          ? `${q.text.slice(0, 117)}…`
                          : q.text}
                      </span>
                      {!q.isActive && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Category */}
                  <TableCell className="text-muted-foreground text-xs">
                    {q.category ?? "—"}
                  </TableCell>

                  {/* Weight */}
                  <TableCell className="text-sm">{q.weight}</TableCell>

                  {/* Critical */}
                  <TableCell>
                    {q.isCritical ? (
                      <Badge variant="destructive" className="text-xs">
                        Critical
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* RBI Ref */}
                  <TableCell
                    className="text-muted-foreground max-w-[9rem] truncate text-xs"
                    title={q.rbiReference ?? undefined}
                  >
                    {q.rbiReference
                      ? q.rbiReference.length > 30
                        ? `${q.rbiReference.slice(0, 27)}…`
                        : q.rbiReference
                      : "—"}
                  </TableCell>

                  {/* Responses count */}
                  <TableCell className="text-muted-foreground text-sm">
                    {q._count.accountExamResponses}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit question"
                        onClick={() => setEditQuestion(q)}
                        disabled={isPending && pendingId === q.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      {q.isActive ? (
                        /* Deactivate */
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-7 w-7"
                          title="Deactivate question"
                          onClick={() => handleDeactivateClick(q)}
                          disabled={isPending && pendingId === q.id}
                        >
                          {isPending && pendingId === q.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        /* Reactivate */
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Reactivate question"
                          onClick={() => handleReactivate(q)}
                          disabled={isPending && pendingId === q.id}
                        >
                          {isPending && pendingId === q.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Deactivation confirmation dialog (for questions with responses) */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Question?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget && (
                <>
                  This question has been answered{" "}
                  <strong>
                    {deactivateTarget._count.accountExamResponses} time
                    {deactivateTarget._count.accountExamResponses !== 1
                      ? "s"
                      : ""}
                  </strong>
                  . Deactivating it will hide it from future examinations but
                  preserve all historical responses.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeactivateTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deactivateTarget && handleDeactivateConfirm(deactivateTarget)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      {editQuestion && (
        <EditQuestionDialog
          question={editQuestion}
          engagementId={engagementId}
          open={!!editQuestion}
          onOpenChange={(o) => !o && setEditQuestion(null)}
        />
      )}
    </>
  );
}
