import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/data-access/prisma";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";

/**
 * Weekly digest cron job (NOTF-05).
 * Runs Monday mornings to aggregate per-tenant audit stats
 * and send to CAE/CCO users.
 *
 * CAE/CCO cannot opt out of weekly digest (regulatory requirement).
 */

/**
 * Start of the current ISO week (most recent Monday, 00:00 server-local).
 * The digest dedup window is one week wide and aligned to this boundary, so a
 * job-level retry or a duplicate schedule later in the same week does not
 * re-queue a second digest, while next Monday opens a fresh window.
 */
function startOfIsoWeek(now: Date): Date {
  const daysSinceMonday = (now.getDay() + 6) % 7; // getDay(): 0=Sun … 6=Sat
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysSinceMonday,
  );
  return monday;
}

/**
 * Process weekly digest across all tenants.
 */
export async function processWeeklyDigest(): Promise<void> {
  console.log("[weekly-digest] Starting weekly digest generation");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  let totalDigests = 0;

  for (const tenant of tenants) {
    try {
      const count = await processDigestForTenant(tenant.id, tenant.name);
      totalDigests += count;
    } catch (error) {
      console.error(
        `[weekly-digest] Error processing tenant ${tenant.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `[weekly-digest] Completed: ${totalDigests} digests queued across ${tenants.length} tenants`,
  );
}

async function processDigestForTenant(
  tenantId: string,
  tenantName: string,
): Promise<number> {
  const db = prismaForTenant(tenantId);
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ─── Aggregate stats ────────────────────────────────────────────────────

  // Total open observations
  const openCount = await db.observation.count({
    where: {
      tenantId,
      status: {
        in: ["DRAFT", "SUBMITTED", "REVIEWED", "ISSUED", "RESPONSE"] as any,
      },
    },
  });

  // Closed this week
  const closedThisWeek = await db.observation.count({
    where: {
      tenantId,
      status: { in: ["CLOSED", "COMPLIANCE"] as any },
      updatedAt: { gte: oneWeekAgo },
    },
  });

  // New assignments this week
  const newThisWeek = await db.observation.count({
    where: {
      tenantId,
      createdAt: { gte: oneWeekAgo },
    },
  });

  // Top 3 critical/high findings
  const topFindings = await db.observation.findMany({
    where: {
      tenantId,
      severity: { in: ["CRITICAL", "HIGH"] as any },
      status: { notIn: ["CLOSED", "COMPLIANCE"] as any },
    },
    select: {
      id: true,
      title: true,
      severity: true,
      dueDate: true,
      branch: { select: { name: true } },
    },
    orderBy: [{ severity: "asc" }, { dueDate: "asc" }],
    take: 3,
  });

  // Upcoming deadlines (next 7 days)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = await db.observation.count({
    where: {
      tenantId,
      dueDate: { gte: now, lte: nextWeek },
      status: { in: ["ISSUED", "RESPONSE"] as any },
    },
  });

  // Overdue count
  const overdueCount = await db.observation.count({
    where: {
      tenantId,
      dueDate: { lt: now },
      status: { in: ["ISSUED", "RESPONSE"] as any },
    },
  });

  // ─── Find CAE/CCO users ──────────────────────────────────────────────────

  const regulatoryUsers = await db.user.findMany({
    where: {
      tenantId,
      roles: { hasSome: ["CAE", "CCO"] as any },
      status: "ACTIVE",
    },
    select: { id: true, name: true, email: true, roles: true },
  });

  if (regulatoryUsers.length === 0) {
    console.log(
      `[weekly-digest] No CAE/CCO users found for tenant ${tenantName}, skipping`,
    );
    return 0;
  }

  // ─── Build payload ────────────────────────────────────────────────────────

  const payload = {
    tenantName,
    weekStart: oneWeekAgo.toISOString(),
    weekEnd: now.toISOString(),
    stats: {
      openObservations: openCount,
      closedThisWeek,
      newThisWeek,
      upcomingDeadlines,
      overdueCount,
    },
    topFindings: topFindings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      dueDate: f.dueDate?.toISOString(),
      branchName: f.branch?.name,
    })),
  } as object;

  // ─── Queue digest for each CAE/CCO (idempotent per ISO week) ──────────────

  // CAE/CCO cannot opt out, so a duplicate digest reaches a regulator. Guard
  // against a job-level retry (retryLimit 3) or a double schedule by skipping
  // any recipient who already has a WEEKLY_DIGEST queued this week. Matches the
  // check-before-insert dedup the deadline/escalation jobs use.
  const weekStart = startOfIsoWeek(now);
  let queued = 0;

  for (const user of regulatoryUsers) {
    const alreadyQueued = await db.notificationQueue.findFirst({
      where: {
        tenantId,
        recipientId: user.id,
        type: "WEEKLY_DIGEST" as any,
        createdAt: { gte: weekStart },
      },
      select: { id: true },
    });

    if (alreadyQueued) continue;

    await withAuditedMutation(
      systemActor(tenantId),
      "notification.digest_queued",
      (tx) =>
        tx.notificationQueue.create({
          data: {
            tenantId,
            recipientId: user.id,
            type: "WEEKLY_DIGEST" as any,
            status: "PENDING",
            payload,
          },
        }),
    );
    queued += 1;
  }

  return queued;
}
