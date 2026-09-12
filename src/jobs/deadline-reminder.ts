import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/data-access/prisma";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";

/**
 * Deadline reminder cron job (NOTF-03).
 * Runs daily to check for upcoming observation deadlines.
 *
 * Creates DEADLINE_REMINDER_7D, DEADLINE_REMINDER_3D, DEADLINE_REMINDER_1D
 * notifications for assignees of active observations.
 *
 * Duplicate prevention: checks EmailLog to ensure same reminder
 * is not sent twice for the same observation + deadline combination.
 */

const REMINDER_WINDOWS = [
  { days: 7, type: "DEADLINE_REMINDER_7D" },
  { days: 3, type: "DEADLINE_REMINDER_3D" },
  { days: 1, type: "DEADLINE_REMINDER_1D" },
] as const;

// Active statuses — observations in these states get reminders
const ACTIVE_STATUSES = ["ISSUED", "RESPONSE"];

/**
 * Process deadline reminders across all tenants.
 * Iterates each tenant with scoped context (RLS compatible).
 */
export async function processDeadlineReminders(): Promise<void> {
  console.log("[deadline-reminder] Starting deadline check");

  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  let totalReminders = 0;

  for (const tenant of tenants) {
    try {
      const count = await processDeadlinesForTenant(tenant.id);
      totalReminders += count;
    } catch (error) {
      console.error(
        `[deadline-reminder] Error processing tenant ${tenant.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `[deadline-reminder] Completed: ${totalReminders} reminders queued across ${tenants.length} tenants`,
  );
}

async function processDeadlinesForTenant(tenantId: string): Promise<number> {
  const db = prismaForTenant(tenantId);
  const now = new Date();
  let remindersQueued = 0;

  for (const window of REMINDER_WINDOWS) {
    // Calculate the target date (now + N days, start of day)
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + window.days);
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // Find observations with dueDate falling on the target day
    const observations = await db.observation.findMany({
      where: {
        tenantId,
        status: { in: ACTIVE_STATUSES as any },
        dueDate: {
          gte: startOfDay,
          lt: endOfDay,
        },
        assignedToId: { not: null },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        dueDate: true,
        assignedToId: true,
        assignedTo: { select: { name: true, email: true } },
        branch: { select: { name: true } },
      },
    });

    for (const obs of observations) {
      if (!obs.assignedToId) continue;

      // Duplicate prevention: check if this specific reminder was already sent
      const alreadySent = await checkDuplicateReminder(
        tenantId,
        obs.id,
        window.type,
      );
      if (alreadySent) continue;

      // Queue the notification. Hoisted: control-flow narrowing of
      // obs.assignedToId does not carry into the callback closure.
      const recipientId = obs.assignedToId;
      await withAuditedMutation(
        systemActor(tenantId),
        "notification.deadline_reminder_queued",
        (tx) =>
          tx.notificationQueue.create({
            data: {
              tenantId,
              recipientId,
              type: window.type as any,
              status: "PENDING",
              payload: {
                observationId: obs.id,
                observationTitle: obs.title,
                severity: obs.severity,
                dueDate: obs.dueDate?.toISOString(),
                daysRemaining: window.days,
                assigneeName: obs.assignedTo?.name,
                branchName: obs.branch?.name,
              } as object,
            },
          }),
      );

      remindersQueued++;
    }
  }

  return remindersQueued;
}

/**
 * Check if a reminder of this type was already sent for this observation today.
 * Prevents duplicate reminders if the cron runs multiple times.
 */
async function checkDuplicateReminder(
  tenantId: string,
  observationId: string,
  reminderType: string,
): Promise<boolean> {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  // Check if a notification of this type for this observation was created today
  const existing = await prisma.notificationQueue.findFirst({
    where: {
      tenantId,
      type: reminderType as any,
      createdAt: { gte: startOfDay },
      payload: {
        path: ["observationId"],
        equals: observationId,
      },
    },
  });

  return existing !== null;
}
