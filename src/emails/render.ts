import { render } from "@react-email/components";
import { createElement } from "react";
import {
  InvitationEmail,
  getInvitationSubject,
} from "./templates/invitation-email";
import {
  AssignmentEmail,
  getAssignmentSubject,
} from "./templates/assignment-email";
import { ResponseEmail, getResponseSubject } from "./templates/response-email";
import { ReminderEmail, getReminderSubject } from "./templates/reminder-email";
import {
  EscalationEmail,
  getEscalationSubject,
} from "./templates/escalation-email";
import {
  WeeklyDigestEmail,
  getWeeklyDigestSubject,
} from "./templates/weekly-digest-email";
import {
  BulkDigestEmail,
  getBulkDigestSubject,
} from "./templates/bulk-digest-email";
import {
  BmBatchOverdueEmail,
  getBmBatchOverdueSubject,
} from "./templates/bm-batch-overdue-email";
import { env } from "@/env";

/**
 * Render a React Email template to HTML and plain text.
 * Plain text ensures compatibility with Indian email providers (Rediffmail).
 */
export async function renderEmail(
  template: React.ReactElement,
): Promise<{ html: string; text: string }> {
  const html = await render(template);
  const text = await render(template, { plainText: true });
  return { html, text };
}

// ─── Template registry ──────────────────────────────────────────────────────

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a named email template with payload data.
 * Used by the notification processor (08-03) to generate emails dynamically.
 */
export async function renderEmailTemplate(
  templateName: string,
  payload: Record<string, unknown>,
): Promise<RenderedEmail> {
  const p = payload as any;
  const bankName = (p.bankName as string) ?? "AEGIS";
  const appUrl = (p.appUrl as string) ?? env.NEXT_PUBLIC_APP_URL;

  let element: React.ReactElement;
  let subject: string;

  switch (templateName) {
    case "invitation":
      element = createElement(InvitationEmail, {
        bankName,
        appUrl,
        inviteeName: p.inviteeName ?? "",
        acceptUrl: p.acceptUrl ?? `${appUrl}/accept-invite`,
        expiresOn: p.expiresOn ?? "",
      });
      subject = getInvitationSubject(bankName);
      break;

    case "assignment":
      element = createElement(AssignmentEmail, {
        bankName,
        appUrl,
        observationTitle: p.observationTitle ?? "",
        severity: p.severity ?? "MEDIUM",
        branchName: p.branchName ?? "",
        dueDate: p.dueDate ?? "",
        conditionExcerpt: p.conditionExcerpt ?? "",
        observationUrl:
          p.observationUrl ?? `${appUrl}/findings/${p.observationId ?? ""}`,
      });
      subject = getAssignmentSubject(bankName, p.observationTitle ?? "");
      break;

    case "response":
      element = createElement(ResponseEmail, {
        bankName,
        appUrl,
        observationTitle: p.observationTitle ?? "",
        severity: p.severity ?? "MEDIUM",
        auditeeName: p.auditeeName ?? "",
        responseTimestamp: p.responseTimestamp ?? "",
        responseExcerpt: p.responseExcerpt ?? "",
        evidenceCount: p.evidenceCount ?? 0,
        reviewUrl: p.reviewUrl ?? `${appUrl}/findings/${p.observationId ?? ""}`,
      });
      subject = getResponseSubject(bankName, p.observationTitle ?? "");
      break;

    case "reminder":
      element = createElement(ReminderEmail, {
        bankName,
        appUrl,
        observationTitle: p.observationTitle ?? "",
        severity: p.severity ?? "MEDIUM",
        daysRemaining: p.daysRemaining ?? 7,
        dueDate: p.dueDate ?? "",
        responseUrl:
          p.responseUrl ?? `${appUrl}/auditee/${p.observationId ?? ""}`,
      });
      subject = getReminderSubject(
        bankName,
        p.daysRemaining ?? 7,
        p.observationTitle ?? "",
      );
      break;

    case "escalation":
      element = createElement(EscalationEmail, {
        bankName,
        appUrl,
        observationTitle: p.observationTitle ?? "",
        severity: p.severity ?? "MEDIUM",
        daysOverdue: p.daysOverdue ?? 1,
        dueDate: p.dueDate ?? "",
        branchName: p.branchName ?? "",
        auditeeName: p.auditeeName ?? "",
        observationUrl:
          p.observationUrl ?? `${appUrl}/findings/${p.observationId ?? ""}`,
      });
      subject = getEscalationSubject(bankName, p.observationTitle ?? "");
      break;

    case "weekly-digest":
      element = createElement(WeeklyDigestEmail, {
        bankName,
        appUrl,
        weekDate: p.weekDate ?? "",
        metrics: p.metrics ?? {
          totalOpen: 0,
          closedThisWeek: 0,
          overdueCount: 0,
          newAssignments: 0,
        },
        topFindings: p.topFindings ?? [],
        upcomingDeadlines: p.upcomingDeadlines ?? [],
        dashboardUrl: p.dashboardUrl ?? `${appUrl}/dashboard`,
      });
      subject = getWeeklyDigestSubject(bankName, p.weekDate ?? "");
      break;

    case "bulk-digest":
      element = createElement(BulkDigestEmail, {
        bankName,
        appUrl,
        observations: p.observations ?? [],
        auditeePortalUrl: p.auditeePortalUrl ?? `${appUrl}/auditee`,
      });
      subject = getBulkDigestSubject(bankName, (p.observations ?? []).length);
      break;

    case "bm-batch-overdue":
      element = createElement(BmBatchOverdueEmail, {
        bankName,
        appUrl,
        branchName: p.branchName ?? "",
        engagementId: p.engagementId ?? "",
        overdueDays: p.overdueDays ?? 1,
        batchId: p.batchId ?? "",
      });
      subject = getBmBatchOverdueSubject(p.branchName ?? "Unknown Branch");
      break;

    default:
      throw new Error(`Unknown email template: ${templateName}`);
  }

  const { html, text } = await renderEmail(element);
  return { subject, html, text };
}
