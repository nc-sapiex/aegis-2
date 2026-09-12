"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOffMeeting } from "@/actions/rbia/meetings";
import type { EngagementMeetingData } from "@/data-access/rbia-meetings";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle, Clock, Pencil, Users, Loader2 } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MeetingViewProps {
  meeting: EngagementMeetingData;
  engagementId: string;
  canEdit: boolean;
  onEdit?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MeetingView({
  meeting,
  engagementId,
  canEdit,
  onEdit,
}: MeetingViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const title =
    meeting.meetingType === "OPENING" ? "Opening Meeting" : "Exit Meeting";

  // ─── Sign-off handler ─────────────────────────────────────────────────

  const handleSignOff = () => {
    startTransition(async () => {
      const result = await signOffMeeting({
        engagementId,
        meetingType: meeting.meetingType,
      });

      if (result.success) {
        toast.success("Meeting signed off");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            {title}
          </CardTitle>
          {meeting.signedOff ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <CheckCircle className="mr-1 h-3 w-3" />
              Signed Off
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600">
              <Clock className="mr-1 h-3 w-3" />
              Pending Sign-off
            </Badge>
          )}
        </div>

        {/* Edit button — only shown when not signed off and user can edit */}
        {canEdit && !meeting.signedOff && onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        )}

        {/* Disabled edit with tooltip when signed off */}
        {canEdit && meeting.signedOff && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" disabled>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Meeting already signed off — cannot edit
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Meeting Date */}
        <div>
          <p className="text-muted-foreground text-sm font-medium">Date</p>
          <p className="text-sm">{formatDate(meeting.meetingDate, "long")}</p>
        </div>

        {/* Attendees */}
        <div>
          <p className="text-muted-foreground mb-2 text-sm font-medium">
            Attendees ({meeting.attendees.length})
          </p>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-left">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Designation</th>
                </tr>
              </thead>
              <tbody>
                {meeting.attendees.map((attendee, idx) => (
                  <tr key={idx} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{attendee.name}</td>
                    <td className="text-muted-foreground px-3 py-2">
                      {attendee.role}
                    </td>
                    <td className="text-muted-foreground px-3 py-2">
                      {attendee.designation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Minutes */}
        {meeting.minutesText && (
          <div>
            <p className="text-muted-foreground mb-1 text-sm font-medium">
              Meeting Minutes
            </p>
            <div className="bg-muted/30 rounded-md border p-3">
              <pre className="text-sm leading-relaxed whitespace-pre-wrap">
                {meeting.minutesText}
              </pre>
            </div>
          </div>
        )}

        {/* Key Discussion Points */}
        {meeting.keyDiscussionPoints && (
          <div>
            <p className="text-muted-foreground mb-1 text-sm font-medium">
              Key Discussion Points
            </p>
            <div className="bg-muted/30 rounded-md border p-3">
              <pre className="text-sm leading-relaxed whitespace-pre-wrap">
                {meeting.keyDiscussionPoints}
              </pre>
            </div>
          </div>
        )}

        {/* Sign-off Section */}
        {meeting.signedOff ? (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-800 dark:text-green-200">
              Signed off
              {meeting.signedOffAt && (
                <span className="text-muted-foreground ml-1">
                  on {formatDate(meeting.signedOffAt, "long")}
                </span>
              )}
            </p>
          </div>
        ) : (
          canEdit && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`signoff-${meeting.meetingType}`}
                  disabled={isPending}
                  onCheckedChange={() => {
                    /* Checkbox is UI-only — sign-off triggered by button */
                  }}
                />
                <label
                  htmlFor={`signoff-${meeting.meetingType}`}
                  className="cursor-pointer text-sm leading-tight"
                >
                  I confirm these meeting minutes are accurate
                </label>
              </div>
              <Button size="sm" onClick={handleSignOff} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign Off
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
