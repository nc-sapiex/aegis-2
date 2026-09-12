"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Pencil,
  ArrowUp,
  Link,
  ClipboardList,
  AlertTriangle,
  MessageSquare,
} from "@/lib/icons";
import { toast } from "sonner";
import { deleteActionPoint } from "@/actions/rbia/findings";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { FindingForm } from "./finding-form";
import type {
  ActionPointData,
  CarryForwardActionPointData,
  ObservationData,
} from "@/data-access/rbia-findings";

// ─── Props ──────────────────────────────────────────────────────────────────

interface FindingsListProps {
  actionPoints: ActionPointData[];
  carryForwardActionPoints: CarryForwardActionPointData[];
  observations: ObservationData[];
  engagementId: string;
  branchId: string;
  engagementStatus: string;
  canManageFindings: boolean;
}

// ─── Types & Constants ──────────────────────────────────────────────────────

type TypeFilter = "all" | "action-points" | "observations";
type FormMode = "create-ap" | "create-observation" | "edit-ap" | "promote";

// Unified item for the merged list
type UnifiedFinding =
  | { type: "ap"; data: ActionPointData }
  | { type: "cf-ap"; data: CarryForwardActionPointData }
  | { type: "observation"; data: ObservationData };

// Colors imported from central constants
import { SEVERITY_BADGE_COLORS as SEVERITY_COLORS } from "@/lib/constants";

const AP_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
  ISSUED: "bg-blue-100 text-blue-700 border-blue-300",
  BM_RESPONSE_DUE: "bg-amber-100 text-amber-700 border-amber-300",
  BM_RESPONDED: "bg-green-100 text-green-700 border-green-300",
  VERIFIED: "bg-emerald-100 text-emerald-700 border-emerald-300",
  CLOSED: "bg-slate-100 text-slate-700 border-slate-300",
};

const OBS_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-300",
  REVIEWED: "bg-purple-100 text-purple-700 border-purple-300",
  ISSUED: "bg-orange-100 text-orange-700 border-orange-300",
  RESPONSE: "bg-yellow-100 text-yellow-700 border-yellow-300",
  COMPLIANCE: "bg-teal-100 text-teal-700 border-teal-300",
  CLOSED: "bg-green-100 text-green-700 border-green-300",
};

const ALL_STATUSES = [
  "DRAFT",
  "ISSUED",
  "BM_RESPONSE_DUE",
  "BM_RESPONDED",
  "VERIFIED",
  "CLOSED",
  "SUBMITTED",
  "REVIEWED",
  "RESPONSE",
  "COMPLIANCE",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getItemId(item: UnifiedFinding): string {
  return item.data.id;
}

function getItemTitle(item: UnifiedFinding): string {
  return item.data.title;
}

function getItemSeverity(item: UnifiedFinding): string {
  return item.data.severity;
}

function getItemStatus(item: UnifiedFinding): string {
  return item.data.status;
}

function getItemCreatedAt(item: UnifiedFinding): Date {
  return typeof item.data.createdAt === "string"
    ? new Date(item.data.createdAt)
    : item.data.createdAt;
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
  canManageFindings,
  onCreateAP,
  onCreateObs,
}: {
  canManageFindings: boolean;
  onCreateAP: () => void;
  onCreateObs: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
        <ClipboardList className="text-muted-foreground h-8 w-8" />
      </div>
      <h3 className="mb-1 text-lg font-medium">No findings yet</h3>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        Create your first Action Point or Observation to begin documenting audit
        findings.
      </p>
      {canManageFindings && (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onCreateAP}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Action Point
          </Button>
          <Button size="sm" variant="outline" onClick={onCreateObs}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Observation
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Finding Row ────────────────────────────────────────────────────────────

function FindingRow({
  item,
  isExpanded,
  onToggle,
  canManageFindings,
  onEdit,
  onPromote,
  onDelete,
}: {
  item: UnifiedFinding;
  isExpanded: boolean;
  onToggle: () => void;
  canManageFindings: boolean;
  onEdit: (item: UnifiedFinding) => void;
  onPromote: (item: UnifiedFinding) => void;
  onDelete: (item: UnifiedFinding) => void;
}) {
  const severity = getItemSeverity(item);
  const status = getItemStatus(item);
  const isDraft = status === "DRAFT";
  const isAP = item.type === "ap" || item.type === "cf-ap";
  const isCF = item.type === "cf-ap";

  // Serial number or OBS prefix
  const prefix = isAP ? `AP-${(item.data as ActionPointData).serialNo}` : "OBS";

  // Module code for APs
  const moduleCode = isAP ? (item.data as ActionPointData).moduleCode : null;

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        isCF && "border-l-4 border-l-amber-400",
      )}
    >
      <CardContent className="px-4 py-3">
        {/* Compact row */}
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
          )}

          {/* Serial / prefix */}
          <span className="text-muted-foreground w-14 shrink-0 font-mono text-xs">
            {prefix}
          </span>

          {/* Title */}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {getItemTitle(item)}
          </span>

          {/* Badges */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Carry-forward badge */}
            {isCF && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-700"
              >
                <Link className="mr-1 h-3 w-3" />
                Carried forward
              </Badge>
            )}

            {/* Type badge */}
            <Badge
              variant="outline"
              className={cn(
                isAP
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-purple-300 bg-purple-50 text-purple-700",
              )}
            >
              {isAP ? "Action Point" : "Observation"}
            </Badge>

            {/* Severity badge */}
            <SeverityBadge severity={severity} />

            {/* Status badge */}
            <Badge
              variant="outline"
              className={
                (isAP ? AP_STATUS_COLORS : OBS_STATUS_COLORS)[status] ?? ""
              }
            >
              {formatStatus(status)}
            </Badge>

            {/* Module code */}
            {moduleCode && (
              <span className="text-muted-foreground hidden text-xs md:inline">
                {moduleCode}
              </span>
            )}
          </div>
        </button>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-4 space-y-3 border-t pt-3">
            {/* Description */}
            {isAP && (
              <p className="text-muted-foreground text-sm">
                {(item.data as ActionPointData).description}
              </p>
            )}
            {!isAP && (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Condition: </span>
                  <span className="text-muted-foreground">
                    {(item.data as ObservationData).condition}
                  </span>
                </p>
                <p>
                  <span className="font-medium">Criteria: </span>
                  <span className="text-muted-foreground">
                    {(item.data as ObservationData).criteria}
                  </span>
                </p>
              </div>
            )}

            {/* Source examination response link (for APs) */}
            {isAP && (item.data as ActionPointData).sourceResponse && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                Flagged from:{" "}
                {(item.data as ActionPointData)
                  .sourceResponse!.node.path.split("/")
                  .filter(Boolean)
                  .join(" > ")}
              </p>
            )}

            {/* BM response section */}
            {isAP && (item.data as ActionPointData).bmResponseText && (
              <div className="rounded-md border bg-green-50/50 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-700">
                  <MessageSquare className="h-3.5 w-3.5" />
                  BM Response{" "}
                  {(item.data as ActionPointData).bmResponseDate &&
                    `- ${formatDate((item.data as ActionPointData).bmResponseDate)}`}
                </p>
                <p className="text-muted-foreground text-sm">
                  {(item.data as ActionPointData).bmResponseText}
                </p>
              </div>
            )}

            {/* Action buttons */}
            {canManageFindings && (
              <div className="flex items-center gap-2 pt-1">
                {isDraft && isAP && !isCF && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item);
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </>
                )}
                {isAP && !isCF && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(item);
                    }}
                  >
                    <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
                    Promote to Observation
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FindingsList({
  actionPoints,
  carryForwardActionPoints,
  observations,
  engagementId,
  branchId,
  engagementStatus,
  canManageFindings,
}: FindingsListProps) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [showCarryForward, setShowCarryForward] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [formState, setFormState] = React.useState<{
    open: boolean;
    mode: FormMode;
    editData?: ActionPointData | ObservationData | null;
    sourceActionPointId?: string;
  }>({ open: false, mode: "create-ap" });
  const [deletePending, startDeleteTransition] = React.useTransition();

  // ─── Build unified list ─────────────────────────────────────────────────

  const unifiedItems = React.useMemo<UnifiedFinding[]>(() => {
    const items: UnifiedFinding[] = [];

    // Current APs
    for (const ap of actionPoints) {
      items.push({ type: "ap", data: ap });
    }

    // Carry-forward APs
    if (showCarryForward) {
      for (const cfAp of carryForwardActionPoints) {
        items.push({ type: "cf-ap", data: cfAp });
      }
    }

    // Observations
    for (const obs of observations) {
      items.push({ type: "observation", data: obs });
    }

    // Sort by createdAt desc
    items.sort(
      (a, b) => getItemCreatedAt(b).getTime() - getItemCreatedAt(a).getTime(),
    );

    return items;
  }, [actionPoints, carryForwardActionPoints, observations, showCarryForward]);

  // ─── Filter ─────────────────────────────────────────────────────────────

  const filteredItems = React.useMemo(() => {
    let items = unifiedItems;

    // Type filter
    if (typeFilter === "action-points") {
      items = items.filter((i) => i.type === "ap" || i.type === "cf-ap");
    } else if (typeFilter === "observations") {
      items = items.filter((i) => i.type === "observation");
    }

    // Status filter
    if (statusFilter !== "all") {
      items = items.filter((i) => getItemStatus(i) === statusFilter);
    }

    return items;
  }, [unifiedItems, typeFilter, statusFilter]);

  // ─── Counts ─────────────────────────────────────────────────────────────

  const apCount =
    actionPoints.length +
    (showCarryForward ? carryForwardActionPoints.length : 0);
  const obsCount = observations.length;
  const totalCount = apCount + obsCount;

  // ─── Handlers ───────────────────────────────────────────────────────────

  function openForm(
    mode: FormMode,
    editData?: ActionPointData | ObservationData | null,
    sourceActionPointId?: string,
  ) {
    setFormState({ open: true, mode, editData, sourceActionPointId });
    setExpandedId(null);
  }

  function closeForm() {
    setFormState({ open: false, mode: "create-ap" });
  }

  function handleFormSuccess() {
    closeForm();
    router.refresh();
  }

  function handleEdit(item: UnifiedFinding) {
    if (item.type === "ap" || item.type === "cf-ap") {
      openForm("edit-ap", item.data as ActionPointData);
    }
  }

  function handlePromote(item: UnifiedFinding) {
    if (item.type === "ap" || item.type === "cf-ap") {
      const ap = item.data as ActionPointData;
      openForm("promote", ap, ap.id);
    }
  }

  function handleDelete(item: UnifiedFinding) {
    if (item.type !== "ap") return;
    const ap = item.data as ActionPointData;
    if (
      !confirm(`Delete Action Point AP-${ap.serialNo}? This cannot be undone.`)
    )
      return;

    startDeleteTransition(async () => {
      const result = await deleteActionPoint({ actionPointId: ap.id });
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(`Action Point AP-${ap.serialNo} deleted`);
        router.refresh();
      }
    });
  }

  // ─── Empty state ────────────────────────────────────────────────────────

  if (totalCount === 0 && !formState.open) {
    return (
      <div className="space-y-4">
        <EmptyState
          canManageFindings={canManageFindings}
          onCreateAP={() => openForm("create-ap")}
          onCreateObs={() => openForm("create-observation")}
        />
        {formState.open && (
          <FindingForm
            engagementId={engagementId}
            branchId={branchId}
            mode={formState.mode}
            existingData={formState.editData}
            sourceActionPointId={formState.sourceActionPointId}
            onCancel={closeForm}
            onSuccess={handleFormSuccess}
          />
        )}
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type toggle buttons */}
        <div className="bg-muted/50 flex items-center rounded-md border p-0.5">
          <Button
            variant={typeFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setTypeFilter("all")}
          >
            All ({totalCount})
          </Button>
          <Button
            variant={typeFilter === "action-points" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setTypeFilter("action-points")}
          >
            Action Points ({apCount})
          </Button>
          <Button
            variant={typeFilter === "observations" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setTypeFilter("observations")}
          >
            Observations ({obsCount})
          </Button>
        </div>

        {/* Status dropdown */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {formatStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Carry-forward toggle */}
        {carryForwardActionPoints.length > 0 && (
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <Checkbox
              checked={showCarryForward}
              onCheckedChange={(checked) =>
                setShowCarryForward(checked === true)
              }
            />
            Show carry-forward ({carryForwardActionPoints.length})
          </label>
        )}

        {/* Spacer + New Finding button */}
        {canManageFindings && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => openForm("create-ap")}
              disabled={formState.open}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Action Point
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openForm("create-observation")}
              disabled={formState.open}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Observation
            </Button>
          </div>
        )}
      </div>

      {/* Filter summary */}
      <p className="text-muted-foreground text-xs">
        {filteredItems.length === totalCount
          ? `${totalCount} findings`
          : `Showing ${filteredItems.length} of ${totalCount} findings`}
      </p>

      {/* Inline form (when open) */}
      {formState.open && (
        <FindingForm
          engagementId={engagementId}
          branchId={branchId}
          mode={formState.mode}
          existingData={formState.editData}
          sourceActionPointId={formState.sourceActionPointId}
          onCancel={closeForm}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Findings list */}
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <FindingRow
            key={getItemId(item)}
            item={item}
            isExpanded={expandedId === getItemId(item)}
            onToggle={() =>
              setExpandedId((prev) =>
                prev === getItemId(item) ? null : getItemId(item),
              )
            }
            canManageFindings={canManageFindings}
            onEdit={handleEdit}
            onPromote={handlePromote}
            onDelete={handleDelete}
          />
        ))}

        {filteredItems.length === 0 && totalCount > 0 && (
          <div className="text-muted-foreground py-8 text-center text-sm">
            No findings match the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
