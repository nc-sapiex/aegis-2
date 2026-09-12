"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MeetingForm } from "@/components/rbia/meeting-form";
import { MeetingView } from "@/components/rbia/meeting-view";
import type { EngagementMeetingData } from "@/data-access/rbia-meetings";
import { Info } from "@/lib/icons";

// ---- Props (all serializable -- no functions) --------------------------------

interface MeetingSectionProps {
  engagementId: string;
  meetingType: "OPENING" | "EXIT";
  existingMeeting: EngagementMeetingData | null;
  teamMembers: Array<{ id: string; name: string; role: string }>;
  branchStaff?: Array<{ name: string; designation: string }>;
  canEdit: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

// ---- Component ---------------------------------------------------------------

/**
 * Client wrapper for meeting form/view toggle.
 *
 * This component exists because server pages cannot pass arrow function callbacks
 * (onCancel, onSuccess) to the MeetingForm client component. MeetingSection owns
 * the form/view toggle state internally.
 *
 * All props are serializable -- no functions passed from server.
 */
export function MeetingSection({
  engagementId,
  meetingType,
  existingMeeting,
  teamMembers,
  branchStaff,
  canEdit,
  disabled = false,
  disabledMessage,
}: MeetingSectionProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "form">(
    existingMeeting ? "view" : "form",
  );

  // When disabled, show the disabled message instead of form/view
  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-4">
        <Info className="text-muted-foreground h-4 w-4 shrink-0" />
        <p className="text-muted-foreground text-sm">
          {disabledMessage ?? "Not yet available."}
        </p>
      </div>
    );
  }

  // View mode -- show existing meeting with edit capability
  if (mode === "view" && existingMeeting) {
    return (
      <MeetingView
        meeting={existingMeeting}
        engagementId={engagementId}
        canEdit={canEdit}
        onEdit={() => setMode("form")}
      />
    );
  }

  // Form mode -- create or edit meeting
  return (
    <MeetingForm
      engagementId={engagementId}
      meetingType={meetingType}
      existingMeeting={existingMeeting}
      teamMembers={teamMembers}
      branchStaff={branchStaff}
      onCancel={() => setMode("view")}
      onSuccess={() => {
        setMode("view");
        router.refresh();
      }}
    />
  );
}
