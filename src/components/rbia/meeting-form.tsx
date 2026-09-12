"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { recordMeeting } from "@/actions/rbia/meetings";
import type { EngagementMeetingData } from "@/data-access/rbia-meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, X, Users } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MeetingFormProps {
  engagementId: string;
  meetingType: "OPENING" | "EXIT";
  existingMeeting: EngagementMeetingData | null;
  teamMembers: Array<{ id: string; name: string; role: string }>;
  branchStaff?: Array<{ name: string; designation: string }>;
  onCancel: () => void;
  onSuccess: () => void;
}

type Attendee = {
  name: string;
  role: string;
  designation: string;
};

// ─── Validation Schema ──────────────────────────────────────────────────────

const MeetingFormSchema = z.object({
  meetingDate: z.string().min(1, "Meeting date is required"),
  minutesText: z.string().max(5000).optional(),
  keyDiscussionPoints: z.string().max(5000).optional(),
});

type MeetingFormValues = z.infer<typeof MeetingFormSchema>;

// ─── Structured Minutes Template ────────────────────────────────────────────

const MINUTES_TEMPLATE = `## Agenda Items

## Decisions Taken

## Action Items

## Next Steps`;

// ─── Component ──────────────────────────────────────────────────────────────

export function MeetingForm({
  engagementId,
  meetingType,
  existingMeeting,
  teamMembers,
  branchStaff = [],
  onCancel,
  onSuccess,
}: MeetingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [attendees, setAttendees] = useState<Attendee[]>(() => {
    if (existingMeeting?.attendees && existingMeeting.attendees.length > 0) {
      return existingMeeting.attendees;
    }
    return [];
  });
  const [attendeeError, setAttendeeError] = useState<string | null>(null);
  const [showAddExternal, setShowAddExternal] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalRole, setExternalRole] = useState("");
  const [externalDesignation, setExternalDesignation] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingFormValues>({
    resolver: zodResolver(MeetingFormSchema as any),
    defaultValues: {
      meetingDate: existingMeeting
        ? new Date(existingMeeting.meetingDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      minutesText: existingMeeting?.minutesText ?? MINUTES_TEMPLATE,
      keyDiscussionPoints: existingMeeting?.keyDiscussionPoints ?? "",
    },
  });

  // ─── Attendee helpers ───────────────────────────────────────────────────

  const isAttendeeSelected = (name: string, role: string) =>
    attendees.some((a) => a.name === name && a.role === role);

  const toggleAttendee = (attendee: Attendee) => {
    setAttendeeError(null);
    setAttendees((prev) => {
      const exists = prev.some(
        (a) => a.name === attendee.name && a.role === attendee.role,
      );
      if (exists) {
        return prev.filter(
          (a) => !(a.name === attendee.name && a.role === attendee.role),
        );
      }
      return [...prev, attendee];
    });
  };

  const removeAttendee = (index: number) => {
    setAttendees((prev) => prev.filter((_, i) => i !== index));
  };

  const addExternalAttendee = () => {
    if (!externalName.trim()) return;
    setAttendeeError(null);
    setAttendees((prev) => [
      ...prev,
      {
        name: externalName.trim(),
        role: externalRole.trim() || "External",
        designation: externalDesignation.trim() || "—",
      },
    ]);
    setExternalName("");
    setExternalRole("");
    setExternalDesignation("");
    setShowAddExternal(false);
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const onSubmit = (data: MeetingFormValues) => {
    if (attendees.length === 0) {
      setAttendeeError("At least 1 attendee is required");
      return;
    }

    startTransition(async () => {
      const result = await recordMeeting({
        engagementId,
        meetingType,
        meetingDate: new Date(data.meetingDate).toISOString(),
        attendees,
        minutesText: data.minutesText || undefined,
        keyDiscussionPoints: data.keyDiscussionPoints || undefined,
      });

      if (result.success) {
        toast.success("Meeting recorded");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  };

  const title = meetingType === "OPENING" ? "Opening Meeting" : "Exit Meeting";

  // ─── Available attendees from team + branch staff ─────────────────────

  const availableTeamMembers: Attendee[] = teamMembers.map((m) => ({
    name: m.name,
    role: m.role,
    designation: "Audit Team",
  }));

  const availableBranchStaff: Attendee[] = branchStaff.map((s) => ({
    name: s.name,
    role: "Branch Staff",
    designation: s.designation,
  }));

  const allAvailable = [...availableTeamMembers, ...availableBranchStaff];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          {existingMeeting ? `Edit ${title}` : `Record ${title}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Meeting Date */}
          <div className="space-y-2">
            <Label htmlFor="meetingDate">Meeting Date *</Label>
            <Input
              id="meetingDate"
              type="date"
              disabled={isPending}
              {...register("meetingDate")}
            />
            {errors.meetingDate && (
              <p className="text-destructive text-sm">
                {errors.meetingDate.message}
              </p>
            )}
          </div>

          {/* Attendees Section */}
          <div className="space-y-3">
            <Label>Attendees *</Label>

            {/* Selected attendees as badges */}
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attendees.map((attendee, idx) => (
                  <Badge
                    key={`${attendee.name}-${idx}`}
                    variant="secondary"
                    className="flex items-center gap-1 py-1 pr-1"
                  >
                    <span>
                      {attendee.name}
                      {attendee.role && attendee.role !== "—"
                        ? ` (${attendee.role})`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttendee(idx)}
                      className="hover:bg-muted rounded p-0.5"
                      disabled={isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Available attendees to select */}
            {allAvailable.length > 0 && (
              <div className="border-input rounded-md border">
                <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium tracking-wider uppercase">
                  Select Attendees
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {availableTeamMembers.length > 0 && (
                    <>
                      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium">
                        Audit Team
                      </div>
                      {availableTeamMembers.map((member) => {
                        const selected = isAttendeeSelected(
                          member.name,
                          member.role,
                        );
                        return (
                          <button
                            key={`team-${member.name}`}
                            type="button"
                            onClick={() => toggleAttendee(member)}
                            disabled={isPending}
                            className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                              selected
                                ? "bg-primary/5 text-primary"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <span>
                              {member.name}{" "}
                              <span className="text-muted-foreground">
                                — {member.role}
                              </span>
                            </span>
                            {selected && (
                              <span className="text-primary text-xs font-medium">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                  {availableBranchStaff.length > 0 && (
                    <>
                      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium">
                        Branch Staff
                      </div>
                      {availableBranchStaff.map((staff) => {
                        const selected = isAttendeeSelected(
                          staff.name,
                          staff.role,
                        );
                        return (
                          <button
                            key={`staff-${staff.name}`}
                            type="button"
                            onClick={() => toggleAttendee(staff)}
                            disabled={isPending}
                            className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                              selected
                                ? "bg-primary/5 text-primary"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <span>
                              {staff.name}{" "}
                              <span className="text-muted-foreground">
                                — {staff.designation}
                              </span>
                            </span>
                            {selected && (
                              <span className="text-primary text-xs font-medium">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Add External Attendee */}
                <div className="border-t">
                  {!showAddExternal ? (
                    <button
                      type="button"
                      onClick={() => setShowAddExternal(true)}
                      className="text-primary flex w-full items-center gap-1.5 px-3 py-2 text-sm"
                      disabled={isPending}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add External Attendee
                    </button>
                  ) : (
                    <div className="space-y-2 p-3">
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="Name *"
                          value={externalName}
                          onChange={(e) => setExternalName(e.target.value)}
                          disabled={isPending}
                        />
                        <Input
                          placeholder="Role"
                          value={externalRole}
                          onChange={(e) => setExternalRole(e.target.value)}
                          disabled={isPending}
                        />
                        <Input
                          placeholder="Designation"
                          value={externalDesignation}
                          onChange={(e) =>
                            setExternalDesignation(e.target.value)
                          }
                          disabled={isPending}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={addExternalAttendee}
                          disabled={!externalName.trim() || isPending}
                        >
                          Add
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowAddExternal(false);
                            setExternalName("");
                            setExternalRole("");
                            setExternalDesignation("");
                          }}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Attendee validation error */}
            {attendeeError && (
              <p className="text-destructive text-sm">{attendeeError}</p>
            )}
          </div>

          {/* Structured Minutes */}
          <div className="space-y-2">
            <Label htmlFor="minutesText">Meeting Minutes</Label>
            <Textarea
              id="minutesText"
              rows={10}
              placeholder="Enter meeting minutes..."
              disabled={isPending}
              className="font-mono text-sm"
              {...register("minutesText")}
            />
            <p className="text-muted-foreground text-xs">
              Use the template headings: Agenda Items, Decisions Taken, Action
              Items, Next Steps
            </p>
          </div>

          {/* Key Discussion Points (optional, shown for both but more relevant for exit) */}
          <div className="space-y-2">
            <Label htmlFor="keyDiscussionPoints">
              Key Discussion Points
              {meetingType === "EXIT" && (
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  (recommended for exit meetings)
                </span>
              )}
            </Label>
            <Textarea
              id="keyDiscussionPoints"
              rows={4}
              placeholder="Summarize key discussion points..."
              disabled={isPending}
              {...register("keyDiscussionPoints")}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingMeeting ? "Update Meeting" : "Record Meeting"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
