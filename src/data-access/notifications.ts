import "server-only";
import { prismaForTenant } from "./prisma";
import {
  withAuditedMutation,
  systemActor,
  userActor,
} from "./audited-mutation";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for notification queue operations and preferences.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for RLS isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data
 *
 * Cross-tenant functions (for cron jobs) import base prisma directly.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Batch window for NOTF-06 ─────────────────────────────────────────────

const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── createNotification ────────────────────────────────────────────────────

/**
 * Create a notification in the queue.
 * If batchKey is provided, sets sendAfter to now + 5 min (NOTF-06 batching window).
 */
export async function createNotification(
  session: Session,
  params: {
    recipientId: string;
    type: string;
    payload: Record<string, unknown>;
    batchKey?: string;
  },
) {
  const tenantId = extractTenantId(session);

  const sendAfter = params.batchKey
    ? new Date(Date.now() + BATCH_WINDOW_MS)
    : new Date();

  return withAuditedMutation(userActor(session), "notification.queued", (tx) =>
    tx.notificationQueue.create({
      data: {
        tenantId,
        recipientId: params.recipientId,
        type: params.type as any,
        payload: params.payload as object,
        batchKey: params.batchKey ?? null,
        sendAfter,
      },
    }),
  );
}

// ─── getNotificationPreferences ────────────────────────────────────────────

/**
 * Fetch or create default notification preferences for a user.
 */
export async function getNotificationPreferences(session: Session) {
  const tenantId = extractTenantId(session);
  const userId = session.user.id;
  const db = prismaForTenant(tenantId);

  const existing = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return withAuditedMutation(
    userActor(session),
    "notification.preferences_created",
    (tx) =>
      tx.notificationPreference.create({
        data: {
          userId,
          tenantId,
          emailEnabled: true,
          digestPreference: "immediate",
        },
      }),
  );
}

// ─── updateNotificationPreferences ─────────────────────────────────────────

/**
 * Update notification preferences for a user.
 * CAE/CCO roles cannot disable weekly digest (regulatory requirement).
 */
export async function updateNotificationPreferences(
  session: Session,
  prefs: {
    emailEnabled?: boolean;
    digestPreference?: string;
  },
) {
  const tenantId = extractTenantId(session);
  const userId = session.user.id;
  const db = prismaForTenant(tenantId);

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId, tenantId },
    select: { roles: true },
  });

  const roles = user.roles as string[];
  const isRegulatory = roles.some((r) =>
    [
      "CAE",
      "CCO",
      "CHIEF_AUDIT_EXECUTIVE",
      "CHIEF_COMPLIANCE_OFFICER",
    ].includes(r),
  );

  if (isRegulatory && prefs.digestPreference === "none") {
    throw new Error(
      "Regulatory roles (CAE/CCO) cannot disable weekly digest notifications",
    );
  }

  return withAuditedMutation(
    userActor(session),
    "notification.preferences_updated",
    (tx) =>
      tx.notificationPreference.upsert({
        where: { userId },
        update: {
          ...(prefs.emailEnabled !== undefined && {
            emailEnabled: prefs.emailEnabled,
          }),
          ...(prefs.digestPreference !== undefined && {
            digestPreference: prefs.digestPreference,
          }),
        },
        create: {
          userId,
          tenantId,
          emailEnabled: prefs.emailEnabled ?? true,
          digestPreference: prefs.digestPreference ?? "immediate",
        },
      }),
  );
}

// ─── getPendingNotifications ───────────────────────────────────────────────

/**
 * Get pending notifications ready for processing.
 * Cross-tenant: runs in pg-boss worker context (no session).
 */
export async function getPendingNotifications(limit = 100) {
  const { prisma } = await import("@/lib/prisma");

  return prisma.notificationQueue.findMany({
    where: {
      status: "PENDING",
      sendAfter: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      recipient: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

// ─── claimNotifications ────────────────────────────────────────────────────

/**
 * Move PENDING rows to PROCESSING for one tenant and return exactly the rows
 * this call won.
 *
 * The status predicate lives in the UPDATE, so an overlapping worker's rows
 * are not re-claimed; the claimId lets us re-read our own winners rather than
 * assuming the ids we asked for.
 */
export async function claimNotifications(
  tenantId: string,
  ids: string[],
  claimId: string,
) {
  const { prisma } = await import("@/lib/prisma");

  await withAuditedMutation(
    systemActor(tenantId),
    "notification.claimed",
    (tx) =>
      tx.notificationQueue.updateMany({
        where: { id: { in: ids }, tenantId, status: "PENDING" },
        data: { status: "PROCESSING", claimId },
      }),
  );

  return prisma.notificationQueue.findMany({
    where: { claimId },
    include: { recipient: { select: { id: true, name: true, email: true } } },
  });
}

// ─── markNotificationSent ──────────────────────────────────────────────────

/**
 * Mark a notification as sent and create an email log entry.
 * Cross-tenant: runs in pg-boss worker context.
 */
export async function markNotificationSent(
  notificationId: string,
  params: {
    sesMessageId: string;
    recipientEmail: string;
    recipientName?: string;
    subject: string;
    templateName: string;
    tenantId: string;
  },
) {
  await withAuditedMutation(
    systemActor(params.tenantId),
    "notification.sent",
    async (tx) => {
      await tx.notificationQueue.update({
        where: { id: notificationId },
        data: {
          status: "SENT",
          processedAt: new Date(),
        },
      });
      await tx.emailLog.create({
        data: {
          tenantId: params.tenantId,
          recipientEmail: params.recipientEmail,
          recipientName: params.recipientName,
          subject: params.subject,
          templateName: params.templateName,
          sesMessageId: params.sesMessageId,
          status: "SENT",
          notificationIds: [notificationId],
        },
      });
    },
  );
}

// ─── markNotificationFailed ────────────────────────────────────────────────

/**
 * Mark a notification as failed, increment retry count.
 * If retryCount < 3, reset to PENDING with exponential backoff.
 * Cross-tenant: runs in pg-boss worker context.
 */
export async function markNotificationFailed(
  notificationId: string,
  error: string,
) {
  const { prisma } = await import("@/lib/prisma");

  const notification = await prisma.notificationQueue.findUniqueOrThrow({
    where: { id: notificationId },
  });

  const newRetryCount = notification.retryCount + 1;
  const maxRetries = 3;
  const willRetry = newRetryCount < maxRetries;

  await withAuditedMutation(
    systemActor(notification.tenantId),
    willRetry ? "notification.retry_scheduled" : "notification.failed",
    (tx) =>
      tx.notificationQueue.update({
        where: { id: notificationId },
        data: willRetry
          ? {
              status: "PENDING",
              retryCount: newRetryCount,
              lastError: error,
              sendAfter: new Date(
                Date.now() + Math.pow(2, newRetryCount) * 60 * 1000,
              ),
            }
          : {
              status: "FAILED",
              retryCount: newRetryCount,
              lastError: error,
              processedAt: new Date(),
            },
      }),
  );
}
