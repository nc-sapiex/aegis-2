"use server";

/**
 * Compliance Escalation Job (Phase 2 — R39)
 *
 * Full escalation pipeline: compute levels → route notifications → create queue entries.
 * Triggered manually through runEscalationJob (session-scoped), and per tenant
 * by the scheduled compliance-escalation job in src/jobs/.
 */

import { prismaForTenant } from "@/data-access/prisma";
import { type NotificationType } from "@/generated/prisma/enums";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import {
  computeBatchEscalation,
  type ComplianceItemForEscalation,
} from "@/lib/escalation-engine";
import { getEscalationRoute } from "@/lib/escalation-router";
import {
  getOpenComplianceItemsWithContext,
  getEscalationRecipients,
} from "@/data-access/compliance-items";
import { logger } from "@/lib/logger";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";

const ESCALATION_CHUNK_SIZE = 100;

/**
 * Run escalation job (session-based, for manual trigger).
 * Requires CAE/AUDIT_MANAGER permission.
 */
export async function runEscalationJob() {
  const session = await getRequiredSession();

  if (!hasPermission(session.user.roles as any, "escalation:compute")) {
    throw new Error("Unauthorized: escalation:compute permission required");
  }

  const tenantId = session.user.tenantId;

  return runEscalationJobInternal(tenantId);
}

/**
 * Run escalation job for one tenant, without a session.
 *
 * Callers supply the tenant: the scheduled job in src/jobs/compliance-escalation.ts,
 * which iterates tenants, and runEscalationJob above, which resolves it from the
 * caller's session after a permission check. There is no HTTP route — the former
 * /api/cron/escalation was removed.
 */
export async function runEscalationJobInternal(tenantId: string) {
  const db = prismaForTenant(tenantId);

  try {
    logger.info({ tenantId }, "Starting escalation job");

    // Step 1: Fetch all open compliance items with context
    const items = await db.complianceItem.findMany({
      where: {
        tenantId,
        status: {
          notIn: ["CLOSED"],
        },
      },
      select: {
        id: true,
        createdAt: true,
        dueDate: true,
        escalationLevel: true,
        branchId: true,
        observation: {
          select: {
            id: true,
            title: true,
            severity: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    logger.info(
      { tenantId, count: items.length },
      "Fetched open compliance items",
    );

    // Step 2: Compute batch escalation
    const escalationInput: ComplianceItemForEscalation[] = items.map(
      (item) => ({
        id: item.id,
        createdAt: item.createdAt,
        dueDate: item.dueDate,
        escalationLevel:
          item.escalationLevel as ComplianceItemForEscalation["escalationLevel"],
      }),
    );

    const updates = computeBatchEscalation(escalationInput);

    logger.info(
      { tenantId, updates: updates.length },
      "Computed escalation updates",
    );

    // Step 3: Pre-fetch recipients per escalation level (at most 4 levels)
    // This avoids re-querying recipients for every item in the loop
    const uniqueLevels = [
      ...new Set(
        updates.filter((u) => u.shouldNotify).map((u) => u.newEscalationLevel),
      ),
    ];

    // Map: escalationLevel → { route, recipients }
    const levelRecipientMap = new Map<
      number,
      {
        route: ReturnType<typeof getEscalationRoute>;
        baseRecipients: { id: string; email: string; name: string }[];
      }
    >();

    for (const level of uniqueLevels) {
      const route = getEscalationRoute(level, {
        observationTitle: "",
        branchName: "",
        daysOverdue: 0,
      });
      if (!route) continue;

      const baseRecipients = await db.user.findMany({
        where: {
          tenantId,
          roles: { hasSome: route.recipientRoles as any },
        },
        select: { id: true, email: true, name: true },
      });

      levelRecipientMap.set(level, { route, baseRecipients });
    }

    // Pre-fetch branch-head users per branch (for items needing BRANCH_HEAD escalation)
    const branchHeadLevels = uniqueLevels.filter((level) => {
      const entry = levelRecipientMap.get(level);
      return entry?.route?.recipientRoles.includes("BRANCH_HEAD");
    });

    const branchIdsNeeded =
      branchHeadLevels.length > 0
        ? [
            ...new Set(
              updates
                .filter(
                  (u) =>
                    u.shouldNotify &&
                    branchHeadLevels.includes(u.newEscalationLevel),
                )
                .map((u) => items.find((i) => i.id === u.id)?.branchId)
                .filter((id): id is string => !!id),
            ),
          ]
        : [];

    // Map: branchId → branch-head users
    const branchHeadMap = new Map<
      string,
      { id: string; email: string; name: string }[]
    >();

    if (branchIdsNeeded.length > 0) {
      // Fetch all branch-head assignments in a single query
      const allBranchHeads = await db.user.findMany({
        where: {
          tenantId,
          roles: { has: "BRANCH_HEAD" as any },
          branchAssignments: { some: { branchId: { in: branchIdsNeeded } } },
        },
        select: {
          id: true,
          email: true,
          name: true,
          branchAssignments: { select: { branchId: true } },
        },
      });

      // Group by branchId
      for (const user of allBranchHeads) {
        for (const assignment of user.branchAssignments) {
          if (!branchHeadMap.has(assignment.branchId)) {
            branchHeadMap.set(assignment.branchId, []);
          }
          branchHeadMap.get(assignment.branchId)!.push({
            id: user.id,
            email: user.email,
            name: user.name,
          });
        }
      }
    }

    // Step 4: Process updates — batch notifications and item updates
    let notificationsSent = 0;
    const notificationsToCreate: {
      tenantId: string;
      recipientId: string;
      type: NotificationType;
      payload: object;
    }[] = [];
    const itemUpdates: {
      id: string;
      escalationLevel: number;
      daysOpen: number;
    }[] = [];

    for (const update of updates) {
      if (!update.shouldNotify) {
        // Still collect non-notifying updates for the item daysOpen sync
        itemUpdates.push({
          id: update.id,
          escalationLevel: update.newEscalationLevel,
          daysOpen: update.daysOpen,
        });
        continue;
      }

      const item = items.find((i) => i.id === update.id);
      if (!item) continue;

      const itemContext = {
        observationTitle: item.observation.title,
        branchName: item.branch?.name || "Unknown Branch",
        daysOverdue: update.daysOverdue,
      };

      const levelEntry = levelRecipientMap.get(update.newEscalationLevel);
      if (!levelEntry) continue;

      const { route, baseRecipients } = levelEntry;
      if (!route) continue;

      // Build recipient list using pre-fetched data
      const recipientMap = new Map(baseRecipients.map((r) => [r.id, r]));

      if (route.recipientRoles.includes("BRANCH_HEAD") && item.branchId) {
        const branchHeads = branchHeadMap.get(item.branchId) ?? [];
        branchHeads.forEach((u) => recipientMap.set(u.id, u));
      }

      const recipients = Array.from(recipientMap.values());

      logger.info(
        {
          tenantId,
          complianceItemId: item.id,
          level: update.newEscalationLevel,
          recipients: recipients.length,
        },
        "Routing escalation notification",
      );

      // Collect notification payloads for batch insert
      for (const recipient of recipients) {
        notificationsToCreate.push({
          tenantId,
          recipientId: recipient.id,
          type: route.notificationType,
          payload: {
            subject: route.subject,
            message: route.messageTemplate,
            complianceItemId: item.id,
            escalationLevel: route.level,
            branchName: itemContext.branchName,
            observationTitle: itemContext.observationTitle,
            daysOverdue: update.daysOverdue,
            urgency: route.urgency,
          },
        });
        notificationsSent++;
      }

      itemUpdates.push({
        id: update.id,
        escalationLevel: update.newEscalationLevel,
        daysOpen: update.daysOpen,
      });
    }

    // Write state changes first, then side-effects (notifications).
    // This ordering ensures a crash leaves items updated but unsent notifications
    // (recoverable on next cron run) rather than duplicate emails.

    // Step 1: Batch-update compliance items in chunked transactions (100 per batch)
    if (itemUpdates.length > 0) {
      for (let i = 0; i < itemUpdates.length; i += ESCALATION_CHUNK_SIZE) {
        const chunk = itemUpdates.slice(i, i + ESCALATION_CHUNK_SIZE);
        await db.$transaction(
          chunk.map((u) =>
            db.complianceItem.update({
              where: { id: u.id, tenantId },
              data: {
                escalationLevel: u.escalationLevel,
                daysOpen: u.daysOpen,
              },
            }),
          ),
        );
      }
    }

    // Step 2: Batch-create notifications (after state is safely written)
    if (notificationsToCreate.length > 0) {
      await withAuditedMutation(
        systemActor(tenantId),
        "notification.escalation_queued",
        (tx) =>
          tx.notificationQueue.createMany({
            data: notificationsToCreate,
            skipDuplicates: true,
          }),
      );
    }

    const summary = {
      processed: items.length,
      escalated: updates.length,
      notificationsSent,
    };

    logger.info({ tenantId, ...summary }, "Escalation job completed");

    return {
      success: true,
      data: summary,
    };
  } catch (error) {
    logger.error({ error, tenantId }, "Escalation job failed");
    throw error;
  }
}
