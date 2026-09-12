import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/data-access/prisma";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";

/**
 * Overdue escalation cron job (NOTF-04).
 * Runs daily to find overdue observations and notify:
 * - The assigned auditee
 * - The observation creator (auditor)
 * - Audit Managers for the tenant
 *
 * Only escalates once per day per observation to avoid spam.
 */

const ACTIVE_STATUSES = ["ISSUED", "RESPONSE"];

/**
 * Process overdue escalation across all tenants.
 */
export async function processOverdueEscalation(): Promise<void> {
  console.log("[overdue-escalation] Starting overdue check");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  let totalEscalations = 0;

  for (const tenant of tenants) {
    try {
      const count = await processOverdueForTenant(tenant.id);
      totalEscalations += count;
    } catch (error) {
      console.error(
        `[overdue-escalation] Error processing tenant ${tenant.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `[overdue-escalation] Completed: ${totalEscalations} escalations queued across ${tenants.length} tenants`,
  );
}

async function processOverdueForTenant(tenantId: string): Promise<number> {
  const db = prismaForTenant(tenantId);
  const now = new Date();
  let escalationsQueued = 0;

  // Find overdue observations
  const overdueObs = await db.observation.findMany({
    where: {
      tenantId,
      status: { in: ACTIVE_STATUSES as any },
      dueDate: { lt: now },
    },
    select: {
      id: true,
      title: true,
      severity: true,
      dueDate: true,
      assignedToId: true,
      createdById: true,
      assignedTo: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
      branch: { select: { name: true } },
    },
  });

  if (overdueObs.length === 0) return 0;

  // Find Audit Managers for this tenant
  const auditManagers = await db.user.findMany({
    where: {
      tenantId,
      roles: { has: "AUDIT_MANAGER" as any },
      status: "ACTIVE",
    },
    select: { id: true, name: true, email: true },
  });

  for (const obs of overdueObs) {
    // Duplicate prevention: check if escalation was already sent today
    const alreadySent = await checkDuplicateEscalation(tenantId, obs.id);
    if (alreadySent) continue;

    const overdueDays = Math.floor(
      (now.getTime() - (obs.dueDate?.getTime() ?? now.getTime())) /
        (1000 * 60 * 60 * 24),
    );

    const payload = {
      observationId: obs.id,
      observationTitle: obs.title,
      severity: obs.severity,
      dueDate: obs.dueDate?.toISOString(),
      overdueDays,
      assigneeName: obs.assignedTo?.name,
      auditorName: obs.createdBy?.name,
      branchName: obs.branch?.name,
    } as object;

    // Collect all recipients (deduplicated)
    const recipientIds = new Set<string>();
    if (obs.assignedToId) recipientIds.add(obs.assignedToId);
    recipientIds.add(obs.createdById);
    for (const mgr of auditManagers) {
      recipientIds.add(mgr.id);
    }

    // Queue escalation for each recipient
    for (const recipientId of recipientIds) {
      await withAuditedMutation(
        systemActor(tenantId),
        "notification.escalation_queued",
        (tx) =>
          tx.notificationQueue.create({
            data: {
              tenantId,
              recipientId,
              type: "OVERDUE_ESCALATION" as any,
              status: "PENDING",
              payload,
            },
          }),
      );
      escalationsQueued++;
    }
  }

  return escalationsQueued;
}

/**
 * Check if escalation was already sent for this observation today.
 */
async function checkDuplicateEscalation(
  tenantId: string,
  observationId: string,
): Promise<boolean> {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const existing = await prisma.notificationQueue.findFirst({
    where: {
      tenantId,
      type: "OVERDUE_ESCALATION" as any,
      createdAt: { gte: startOfDay },
      payload: {
        path: ["observationId"],
        equals: observationId,
      },
    },
  });

  return existing !== null;
}
