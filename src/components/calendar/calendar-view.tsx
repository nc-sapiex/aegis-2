"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/actions/admin/manage-calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Loader2,
  Trash2,
  Calendar as CalendarIcon,
  Pencil,
  Repeat2,
} from "@/lib/icons";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type CalendarEvent = {
  id: string;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date | null;
  allDay: boolean;
  recurrenceRule: string | null;
  description: string | null;
  branch: { name: string; code: string } | null;
  engagement: { auditNumber: string | null } | null;
};

interface CalendarViewProps {
  events: CalendarEvent[];
  canManage: boolean;
}

/** An expanded event instance — either the original or a recurring ghost. */
type ExpandedEvent = CalendarEvent & {
  /** The date this particular instance falls on. */
  instanceDate: Date;
  /** True when this row is a generated recurrence ghost (not the master). */
  isRecurringInstance: boolean;
  /** For recurring instances, the master event's ID for editing. */
  masterEventId: string;
};

/* -------------------------------------------------------------------------- */
/*                         Recurrence Expansion Helper                        */
/* -------------------------------------------------------------------------- */

const RECURRENCE_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  ANNUAL: "Annual",
};

/**
 * Given a base date and a recurrence rule, returns the next occurrence date
 * after `base` by adding the appropriate interval.
 */
function addRecurrenceInterval(base: Date, rule: string): Date {
  const next = new Date(base);
  switch (rule) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "HALF_YEARLY":
      next.setMonth(next.getMonth() + 6);
      break;
    case "ANNUAL":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Unknown rule, just return same date (no expansion)
      break;
  }
  return next;
}

/**
 * Expand recurring events into individual instances within a view window.
 *
 * - One-time events pass through unchanged.
 * - Recurring events produce the master (at its original date) plus generated
 *   instances up to `viewEnd`. Instances carry `isRecurringInstance: true` so
 *   the UI can badge them.
 *
 * The view window defaults to the current year +/- 6 months so the user can
 * scroll through a reasonable range without generating infinite rows.
 */
function expandRecurringEvents(
  events: CalendarEvent[],
  viewStart: Date,
  viewEnd: Date,
): ExpandedEvent[] {
  const expanded: ExpandedEvent[] = [];

  for (const event of events) {
    const start = new Date(event.startDate);

    // Always include the master event
    expanded.push({
      ...event,
      instanceDate: start,
      isRecurringInstance: false,
      masterEventId: event.id,
    });

    // Generate recurring instances
    if (event.recurrenceRule) {
      let cursor = addRecurrenceInterval(start, event.recurrenceRule);
      // Safety cap: max 52 instances (roughly one year of weekly events)
      let count = 0;
      const MAX_INSTANCES = 52;

      while (cursor <= viewEnd && count < MAX_INSTANCES) {
        if (cursor >= viewStart) {
          expanded.push({
            ...event,
            instanceDate: new Date(cursor),
            isRecurringInstance: true,
            masterEventId: event.id,
          });
        }
        cursor = addRecurrenceInterval(cursor, event.recurrenceRule);
        count++;
      }
    }
  }

  // Sort by instance date ascending
  expanded.sort((a, b) => a.instanceDate.getTime() - b.instanceDate.getTime());

  return expanded;
}

/* -------------------------------------------------------------------------- */
/*                                Color Config                                */
/* -------------------------------------------------------------------------- */

const EVENT_TYPE_COLORS: Record<string, string> = {
  RBIA: "bg-blue-100 text-blue-800 border-blue-300",
  CONCURRENT: "bg-purple-100 text-purple-800 border-purple-300",
  IS_EDP: "bg-cyan-100 text-cyan-800 border-cyan-300",
  STATUTORY: "bg-orange-100 text-orange-800 border-orange-300",
  MEETING: "bg-green-100 text-green-800 border-green-300",
};

/* -------------------------------------------------------------------------- */
/*                              Event Form Fields                             */
/* -------------------------------------------------------------------------- */

function EventFormFields({
  idPrefix,
  title,
  setTitle,
  eventType,
  setEventType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  description,
  setDescription,
  recurrenceRule,
  setRecurrenceRule,
}: {
  idPrefix: string;
  title: string;
  setTitle: (v: string) => void;
  eventType: string;
  setEventType: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  recurrenceRule: string;
  setRecurrenceRule: (v: string) => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          placeholder="RBIA Audit - Branch XYZ"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Event Type</Label>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger id={`${idPrefix}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RBIA">RBIA</SelectItem>
            <SelectItem value="CONCURRENT">Concurrent</SelectItem>
            <SelectItem value="IS_EDP">IS/EDP Audit</SelectItem>
            <SelectItem value="STATUTORY">Statutory</SelectItem>
            <SelectItem value="MEETING">Meeting</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-start`}>Start Date</Label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-end`}>End Date</Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-desc`}>Description (optional)</Label>
        <Textarea
          id={`${idPrefix}-desc`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-recurrence`}>Recurrence (optional)</Label>
        <Select value={recurrenceRule} onValueChange={setRecurrenceRule}>
          <SelectTrigger id={`${idPrefix}-recurrence`}>
            <SelectValue placeholder="No recurrence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None (one-time)</SelectItem>
            <SelectItem value="WEEKLY">Weekly</SelectItem>
            <SelectItem value="BIWEEKLY">Every 2 Weeks</SelectItem>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="QUARTERLY">Quarterly</SelectItem>
            <SelectItem value="HALF_YEARLY">Half-Yearly</SelectItem>
            <SelectItem value="ANNUAL">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Main Component                                */
/* -------------------------------------------------------------------------- */

export function CalendarView({ events, canManage }: CalendarViewProps) {
  const router = useRouter();
  const [filterType, setFilterType] = React.useState<string>("all");

  // Unified dialog state — null = closed, "create" = new, string = editing event ID
  const [dialogMode, setDialogMode] = React.useState<null | "create" | string>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form state (shared between create & edit)
  const [title, setTitle] = React.useState("");
  const [eventType, setEventType] = React.useState<string>("RBIA");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [recurrenceRule, setRecurrenceRule] = React.useState("");

  const isEditing = dialogMode !== null && dialogMode !== "create";
  const dialogOpen = dialogMode !== null;

  /* ------------------------------ Helpers --------------------------------- */

  /** Reset all form fields to defaults. */
  const resetForm = React.useCallback(() => {
    setTitle("");
    setEventType("RBIA");
    setStartDate("");
    setEndDate("");
    setAllDay(false);
    setDescription("");
    setRecurrenceRule("");
  }, []);

  /** Open the dialog in create mode. */
  const openCreateDialog = React.useCallback(() => {
    resetForm();
    setDialogMode("create");
  }, [resetForm]);

  /** Open the dialog in edit mode, pre-populated with the event data. */
  const openEditDialog = React.useCallback((event: CalendarEvent) => {
    setTitle(event.title);
    setEventType(event.eventType);
    setStartDate(new Date(event.startDate).toISOString().split("T")[0]);
    setEndDate(
      event.endDate ? new Date(event.endDate).toISOString().split("T")[0] : "",
    );
    setAllDay(event.allDay);
    setDescription(event.description ?? "");
    setRecurrenceRule(event.recurrenceRule ?? "");
    setDialogMode(event.id);
  }, []);

  /** Close dialog and reset. */
  const closeDialog = React.useCallback(() => {
    setDialogMode(null);
    resetForm();
  }, [resetForm]);

  /* ----------------------- Recurrence Expansion -------------------------- */

  // View window: 6 months before today to 12 months after today
  const viewWindow = React.useMemo(() => {
    const now = new Date();
    const viewStart = new Date(now);
    viewStart.setMonth(viewStart.getMonth() - 6);
    viewStart.setDate(1);
    const viewEnd = new Date(now);
    viewEnd.setMonth(viewEnd.getMonth() + 12);
    viewEnd.setDate(28); // safe end-of-month
    return { viewStart, viewEnd };
  }, []);

  // Filter events by type first
  const filteredEvents = React.useMemo(() => {
    if (filterType === "all") return events;
    return events.filter((e) => e.eventType === filterType);
  }, [events, filterType]);

  // Expand recurring events into instances
  const expandedEvents = React.useMemo(
    () =>
      expandRecurringEvents(
        filteredEvents,
        viewWindow.viewStart,
        viewWindow.viewEnd,
      ),
    [filteredEvents, viewWindow],
  );

  // Group expanded events by month
  const groupedEvents = React.useMemo(() => {
    const groups = new Map<string, ExpandedEvent[]>();
    for (const event of expandedEvents) {
      const monthKey = event.instanceDate.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
      });
      if (!groups.has(monthKey)) groups.set(monthKey, []);
      groups.get(monthKey)!.push(event);
    }
    // Sort groups by date descending (most recent month first)
    return Array.from(groups.entries()).sort(
      (a, b) => b[1][0].instanceDate.getTime() - a[1][0].instanceDate.getTime(),
    );
  }, [expandedEvents]);

  /* ----------------------------- Actions --------------------------------- */

  const handleSave = async () => {
    if (!title.trim() || !startDate) {
      toast.error("Please provide title and start date");
      return;
    }

    setIsSubmitting(true);

    if (isEditing) {
      // Update existing event
      const result = await updateCalendarEvent({
        eventId: dialogMode as string,
        title,
        eventType: eventType as any,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        description: description || null,
        recurrenceRule: recurrenceRule || null,
      });
      setIsSubmitting(false);

      if (result.success) {
        toast.success("Event updated");
        closeDialog();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } else {
      // Create new event
      const result = await createCalendarEvent({
        title,
        eventType: eventType as any,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        allDay,
        description: description || undefined,
        recurrenceRule: recurrenceRule || undefined,
      });
      setIsSubmitting(false);

      if (result.success) {
        toast.success("Calendar event created");
        closeDialog();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Delete this calendar event?")) return;

    const result = await deleteCalendarEvent(eventId);
    if (result.success) {
      toast.success("Event deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  /** Handle clicking an event card — opens edit dialog for the master event. */
  const handleEventClick = React.useCallback(
    (expanded: ExpandedEvent) => {
      if (!canManage) return;
      // Always edit the master event, even when clicking a recurring instance
      const masterEvent = events.find((e) => e.id === expanded.masterEventId);
      if (masterEvent) {
        openEditDialog(masterEvent);
      }
    },
    [canManage, events, openEditDialog],
  );

  /* -------------------------------- UI ----------------------------------- */

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Label>Filter:</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="RBIA">RBIA</SelectItem>
              <SelectItem value="CONCURRENT">Concurrent</SelectItem>
              <SelectItem value="IS_EDP">IS/EDP</SelectItem>
              <SelectItem value="STATUTORY">Statutory</SelectItem>
              <SelectItem value="MEETING">Meeting</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Event
          </Button>
        )}
      </div>

      {/* Events list grouped by month */}
      <div className="space-y-6">
        {groupedEvents.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-8 text-center">
              No calendar events found.
            </CardContent>
          </Card>
        ) : (
          groupedEvents.map(([month, monthEvents]) => (
            <div key={month} className="space-y-3">
              <h2 className="text-muted-foreground text-lg font-semibold">
                {month}
              </h2>
              <div className="space-y-2">
                {monthEvents.map((event, idx) => (
                  <Card
                    key={`${event.id}-${event.instanceDate.toISOString()}-${idx}`}
                    className={
                      event.isRecurringInstance
                        ? "cursor-pointer border-2 border-dashed"
                        : "cursor-pointer"
                    }
                    onClick={() => handleEventClick(event)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="text-muted-foreground h-4 w-4" />
                            <CardTitle className="text-base">
                              {event.title}
                            </CardTitle>
                            {/* Recurring indicator */}
                            {event.recurrenceRule && (
                              <Badge
                                variant="secondary"
                                className="gap-1 text-xs"
                              >
                                <Repeat2 className="h-3 w-3" />
                                {RECURRENCE_LABEL[event.recurrenceRule] ??
                                  event.recurrenceRule}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                EVENT_TYPE_COLORS[event.eventType] ?? ""
                              }
                            >
                              {event.eventType.replace(/_/g, " ")}
                            </Badge>
                            {event.branch && (
                              <span className="text-muted-foreground text-sm">
                                {event.branch.code}
                              </span>
                            )}
                            {event.isRecurringInstance && (
                              <span className="text-muted-foreground text-xs italic">
                                (recurring instance)
                              </span>
                            )}
                          </div>
                        </div>
                        {canManage && !event.isRecurringInstance && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(event);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(event.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                        {canManage && event.isRecurringInstance && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(event);
                              }}
                              title="Edit master event"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-muted-foreground flex items-center gap-4 text-sm">
                        <span>
                          {event.instanceDate.toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {event.endDate && !event.isRecurringInstance && (
                          <>
                            <span>&rarr;</span>
                            <span>
                              {new Date(event.endDate).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-muted-foreground mt-2 text-sm">
                          {event.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Unified Create / Edit Event Dialog */}
      {canManage && (
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Edit Calendar Event" : "Create Calendar Event"}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Update event details."
                  : "Schedule an audit engagement or meeting."}
              </DialogDescription>
            </DialogHeader>

            <EventFormFields
              idPrefix={isEditing ? "edit" : "create"}
              title={title}
              setTitle={setTitle}
              eventType={eventType}
              setEventType={setEventType}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              description={description}
              setDescription={setDescription}
              recurrenceRule={recurrenceRule}
              setRecurrenceRule={setRecurrenceRule}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeDialog}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
