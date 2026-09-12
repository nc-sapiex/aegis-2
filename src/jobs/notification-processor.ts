import { randomUUID } from "crypto";
import { sendEmail } from "@/lib/ses-client";
import { renderEmailTemplate } from "@/emails/render";
import {
  getPendingNotifications,
  claimNotifications,
  markNotificationSent,
  markNotificationFailed,
} from "@/data-access/notifications";
import { logger } from "@/lib/logger";

/**
 * Notification processor job handler.
 * Runs every minute via pg-boss to dequeue and send pending notifications.
 *
 * Flow:
 * 1. Fetch pending notifications (sendAfter <= now, status = PENDING)
 * 2. Group by batchKey (null = individual, non-null = batched)
 * 3. Render email template based on notification type
 * 4. Send via SES
 * 5. Mark as SENT (creates EmailLog) or FAILED (with retry backoff)
 */

// ─── Template type mapping ──────────────────────────────────────────────────

const TEMPLATE_MAP: Record<string, string> = {
  OBSERVATION_ASSIGNED: "assignment",
  RESPONSE_SUBMITTED: "response",
  DEADLINE_REMINDER_7D: "reminder",
  DEADLINE_REMINDER_3D: "reminder",
  DEADLINE_REMINDER_1D: "reminder",
  OVERDUE_ESCALATION: "escalation",
  WEEKLY_DIGEST: "weekly-digest",
  BULK_DIGEST: "bulk-digest",
  INVITATION: "invitation",
  BM_BATCH_OVERDUE: "bm-batch-overdue",
};

// ─── Email rendering ────────────────────────────────────────────────────────

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a notification to email HTML using React Email templates (08-02).
 */
async function renderNotificationEmail(
  type: string,
  payload: Record<string, unknown>,
): Promise<RenderedEmail> {
  const templateName = TEMPLATE_MAP[type] ?? "assignment";
  return renderEmailTemplate(templateName, payload);
}

// ─── Main processor ─────────────────────────────────────────────────────────

/**
 * Process pending notifications.
 * Called by pg-boss worker on cron schedule (every minute).
 */
export async function processNotifications(): Promise<void> {
  const notifications = await getPendingNotifications(50);

  if (notifications.length === 0) return;

  logger.info(
    {
      action: "notification_processor_start",
      notifications: notifications.length,
    },
    "Processing notifications",
  );

  // The queue is read across tenants, but a session context carries exactly
  // one tenant, so claim one tenant at a time. A failed claim must not strand
  // the tenants already claimed: later runs only select PENDING rows, so
  // anything left PROCESSING but unsent would sit there for good.
  const idsByTenant = new Map<string, string[]>();
  for (const n of notifications) {
    const ids = idsByTenant.get(n.tenantId) ?? [];
    ids.push(n.id);
    idsByTenant.set(n.tenantId, ids);
  }

  const claimedNotifications: typeof notifications = [];

  for (const [tenantId, ids] of idsByTenant) {
    try {
      const won = await claimNotifications(tenantId, ids, randomUUID());
      claimedNotifications.push(...won);
    } catch (error) {
      logger.error(
        {
          action: "notification_claim_failed",
          tenantId,
          stranded: ids.length,
          message:
            error instanceof Error ? error.message : "Unknown claim error",
        },
        "Failed to claim notifications; left PENDING for the next run",
      );
    }
  }

  if (claimedNotifications.length === 0) return;

  const individual = claimedNotifications.filter((n) => !n.batchKey);

  // A batch is one email to one person. Grouping by batchKey alone would let a
  // reused key merge two tenants' or two recipients' notifications into a
  // single send addressed to whichever row happened to be first.
  const batched = new Map<string, typeof notifications>();
  for (const n of claimedNotifications.filter((n) => n.batchKey)) {
    const key = `${n.tenantId}::${n.recipientId}::${n.batchKey}`;
    if (!batched.has(key)) batched.set(key, []);
    batched.get(key)!.push(n);
  }

  for (const notification of individual) {
    await processOneNotification(notification);
  }

  for (const [groupKey, group] of batched) {
    await processBatchedNotifications(groupKey, group);
  }
}

// ─── Process single notification ────────────────────────────────────────────

async function processOneNotification(
  notification: Awaited<ReturnType<typeof getPendingNotifications>>[number],
): Promise<void> {
  try {
    const payload = notification.payload as Record<string, unknown>;
    const rendered = await renderNotificationEmail(notification.type, payload);

    const result = await sendEmail({
      to: notification.recipient.email,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
    });

    if (result.success) {
      await markNotificationSent(notification.id, {
        sesMessageId: result.messageId,
        recipientEmail: notification.recipient.email,
        recipientName: notification.recipient.name,
        subject: rendered.subject,
        templateName: TEMPLATE_MAP[notification.type] ?? "unknown",
        tenantId: notification.tenantId,
      });
    } else {
      await markNotificationFailed(notification.id, result.error);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";
    logger.error(
      {
        action: "notification_process_failed",
        notificationId: notification.id,
        message,
      },
      "Failed to process notification",
    );
    await markNotificationFailed(notification.id, message);
  }
}

// ─── Process batched notifications ──────────────────────────────────────────

async function processBatchedNotifications(
  groupKey: string,
  notifications: Awaited<ReturnType<typeof getPendingNotifications>>,
): Promise<void> {
  if (notifications.length === 0) return;

  const recipient = notifications[0].recipient;
  const tenantId = notifications[0].tenantId;

  // The grouping key already guarantees this; assert it anyway, because the
  // failure mode is one bank's findings emailed to another bank's manager.
  const mixed = notifications.some(
    (n) => n.tenantId !== tenantId || n.recipient.id !== recipient.id,
  );
  if (mixed) {
    logger.error(
      { action: "notification_batch_mixed", groupKey },
      "Refusing to send a batch spanning tenants or recipients",
    );
    for (const n of notifications) {
      await markNotificationFailed(n.id, "Batch spanned tenants or recipients");
    }
    return;
  }

  try {
    const payload = {
      recipientName: recipient.name,
      observations: notifications.map((n) => n.payload),
      count: notifications.length,
    };

    const rendered = await renderNotificationEmail("BULK_DIGEST", payload);

    const result = await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
    });

    if (result.success) {
      // Mark all notifications in the batch as sent
      for (const n of notifications) {
        await markNotificationSent(n.id, {
          sesMessageId: result.messageId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject: rendered.subject,
          templateName: "bulk-digest",
          tenantId,
        });
      }
    } else {
      for (const n of notifications) {
        await markNotificationFailed(n.id, result.error);
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown batch processing error";
    logger.error(
      {
        action: "notification_batch_failed",
        batchKey: groupKey,
        message,
      },
      "Failed to process notification batch",
    );
    for (const n of notifications) {
      await markNotificationFailed(n.id, message);
    }
  }
}
