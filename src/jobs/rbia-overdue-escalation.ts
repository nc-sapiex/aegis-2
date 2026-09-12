import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/data-access/prisma";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";

/**
 * RBIA overdue escalation cron job (BMRP-05).
 * Runs daily within the DEADLINE_CHECK job to find BmResponseBatch records
 * past their deadline, transitions status from PENDING to OVERDUE,
 * and queues email notifications for all active Zonal Auditors.
 *
 * Double-firing is prevented by atomic transaction wrapping both the
 * status update and notification creation — if notification creation fails,
 * the status rolls back to PENDING for retry on the next cron run.
 */

/**
 * Process RBIA overdue escalation across all tenants.
 */
export async function processRbiaOverdueEscalation(): Promise<void> {
  console.log("[rbia-overdue] Starting BM response batch overdue check");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  let totalOverdue = 0;

  for (const tenant of tenants) {
    try {
      const count = await processRbiaOverdueForTenant(tenant.id);
      totalOverdue += count;
    } catch (error) {
      console.error(
        `[rbia-overdue] Error processing tenant ${tenant.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `[rbia-overdue] Completed: ${totalOverdue} batches marked OVERDUE across ${tenants.length} tenants`,
  );
}

async function processRbiaOverdueForTenant(tenantId: string): Promise<number> {
  const db = prismaForTenant(tenantId);
  const now = new Date();

  // Find overdue batches — only PENDING batches past their deadline
  const overdueBatches = await db.bmResponseBatch.findMany({
    where: {
      tenantId,
      status: "PENDING",
      deadline: { lt: now },
    },
    select: {
      id: true,
      engagementId: true,
      deadline: true,
      engagement: {
        select: {
          branch: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (overdueBatches.length === 0) return 0;

  // Find active Zonal Auditors for this tenant
  const zonalAuditors = await db.user.findMany({
    where: {
      tenantId,
      roles: { has: "ZONAL_AUDITOR" as any },
      status: "ACTIVE",
    },
    select: { id: true, email: true },
  });

  let batchesProcessed = 0;

  for (const batch of overdueBatches) {
    const overdueDays = Math.floor(
      (now.getTime() - batch.deadline.getTime()) / (1000 * 60 * 60 * 24),
    );
    const branchName = batch.engagement.branch?.name ?? "Unknown Branch";

    // Atomic transaction: update status + create notifications
    // If notification creation fails, status rolls back to PENDING
    await withAuditedMutation(
      systemActor(tenantId),
      "bm_batch.overdue_escalated",
      async (tx) => {
        // Transition batch to OVERDUE
        await tx.bmResponseBatch.update({
          where: { id: batch.id },
          data: { status: "OVERDUE" },
        });

        // Queue notification for each Zonal Auditor
        for (const za of zonalAuditors) {
          await tx.notificationQueue.create({
            data: {
              tenantId,
              recipientId: za.id,
              type: "BM_BATCH_OVERDUE" as any,
              status: "PENDING",
              payload: {
                batchId: batch.id,
                engagementId: batch.engagementId,
                branchName,
                overdueDays,
              } as object,
            },
          });
        }
      },
    );

    batchesProcessed++;
  }

  console.log(
    `[rbia-overdue] Tenant ${tenantId}: ${batchesProcessed} batches marked OVERDUE`,
  );

  return batchesProcessed;
}
