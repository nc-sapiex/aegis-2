import { getRequiredSession } from "@/data-access/session";
import { getEngagementWithTeam } from "@/data-access/audit-execution";
import { getEngagementMeetings } from "@/data-access/rbia-meetings";
import { hasPermission } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft } from "@/lib/icons";
import { EngagementStepper } from "@/components/rbia/engagement-stepper";
import { StatusTransitionControl } from "@/components/rbia/status-transition-control";
import { TabNav } from "@/components/rbia/tab-nav";
import {
  ENGAGEMENT_TRANSITIONS,
  type EngagementStatus,
} from "@/lib/engagement-state-machine";

// ---- Helper functions --------------------------------------------------------

/**
 * Derive the primary (non-CANCELLED) next status from the state machine.
 * Returns empty string for terminal states.
 */
function deriveNextStatus(status: string): string {
  const transitions = ENGAGEMENT_TRANSITIONS[status as EngagementStatus] ?? [];
  const primary = transitions.find((t) => t.to !== "CANCELLED");
  return primary?.to ?? "";
}

/**
 * Derive the transition button label from the state machine.
 */
function deriveTransitionLabel(status: string): string {
  const transitions = ENGAGEMENT_TRANSITIONS[status as EngagementStatus] ?? [];
  const primary = transitions.find((t) => t.to !== "CANCELLED");
  return primary?.label ?? "";
}

/**
 * Check if the meeting prerequisite is satisfied for the current status transition.
 */
function isPrerequisiteMet(
  status: string,
  openingMeetingRecorded: boolean,
  exitMeetingRecorded: boolean,
): boolean {
  if (status === "OPENING_MEETING") return openingMeetingRecorded;
  if (status === "EXIT_MEETING") return exitMeetingRecorded;
  return true;
}

/**
 * Get the prerequisite message for disabled tooltip.
 */
function getPrerequisiteMessage(status: string): string {
  if (status === "OPENING_MEETING") return "Record opening meeting first";
  if (status === "EXIT_MEETING") return "Record exit meeting first";
  return "";
}

// ---- Layout ------------------------------------------------------------------

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ engagementId: string }>;
}

/**
 * Shared layout for all RBIA engagement detail pages.
 *
 * Renders:
 * 1. Back link to audit list
 * 2. Engagement stepper showing current lifecycle stage
 * 3. Status transition control with disabled tooltip when prerequisite not met
 * 4. Tab navigation (Examination / Loan Portfolio / Sampling / Account Exam / Findings / Meetings / Score / Questions*)
 *    * Questions tab only visible to HIA/CAE (audit_execution:manage_sections permission)
 * 5. Page content (children -- each tab is a separate Next.js page)
 */
export default async function RbiaLayout({ children, params }: LayoutProps) {
  const { engagementId } = await params;
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "audit_execution:read")) {
    redirect("/dashboard");
  }

  const engagement = await getEngagementWithTeam(session, engagementId);
  if (!engagement) {
    notFound();
  }

  // Load meeting status for stepper and transition prerequisites
  const meetings = await getEngagementMeetings(session, engagementId);
  const openingMeetingRecorded = meetings.some(
    (m) => m.meetingType === "OPENING",
  );
  const exitMeetingRecorded = meetings.some((m) => m.meetingType === "EXIT");

  const canManageStatus = hasPermission(
    userRoles,
    "audit_execution:manage_team",
  );
  const nextStatus = deriveNextStatus(engagement.status);
  const transitionLabel = deriveTransitionLabel(engagement.status);
  const prerequisiteMet = isPrerequisiteMet(
    engagement.status,
    openingMeetingRecorded,
    exitMeetingRecorded,
  );
  const prerequisiteMessage = getPrerequisiteMessage(engagement.status);

  const basePath = `/audit-execution/${engagementId}/rbia`;

  // HIA/CAE only — conditionally show Questions tab
  const canManageQuestions = hasPermission(
    userRoles,
    "audit_execution:manage_sections",
  );

  return (
    <div className="space-y-4">
      {/* Back link */}
      <a
        href="/audit-execution"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Audits
      </a>

      {/* Engagement stepper -- from Plan 22-01 */}
      <EngagementStepper
        currentStatus={engagement.status}
        openingMeetingRecorded={openingMeetingRecorded}
        exitMeetingRecorded={exitMeetingRecorded}
      />

      {/* Status transition control with disabled tooltip per CONTEXT.md */}
      {nextStatus && (
        <div className="flex items-center gap-3">
          <StatusTransitionControl
            currentStatus={engagement.status}
            nextStatus={nextStatus}
            label={transitionLabel}
            engagementId={engagementId}
            canTransition={canManageStatus}
            prerequisiteMet={prerequisiteMet}
            prerequisiteMessage={prerequisiteMessage}
          />
        </div>
      )}

      {/* Tab navigation -- URL-based segments */}
      <TabNav
        tabs={[
          {
            key: "examination",
            label: "Examination",
            href: basePath,
          },
          {
            key: "loan-portfolio",
            label: "Loan Portfolio",
            href: `${basePath}/loan-portfolio`,
          },
          {
            key: "sampling",
            label: "Sampling",
            href: `${basePath}/sampling`,
          },
          {
            key: "account-exam",
            label: "Account Exam",
            href: `${basePath}/examination/CRD-HLN`,
          },
          {
            key: "findings",
            label: "Findings",
            href: `${basePath}/findings`,
          },
          {
            key: "meetings",
            label: "Meetings",
            href: `${basePath}/meetings`,
          },
          {
            key: "score",
            label: "Score",
            href: `${basePath}/score`,
          },
          // HIA/CAE only — hidden from auditors
          ...(canManageQuestions
            ? [
                {
                  key: "questions",
                  label: "Questions",
                  href: `${basePath}/questions`,
                },
              ]
            : []),
        ]}
      />

      {/* Page content */}
      {children}
    </div>
  );
}
