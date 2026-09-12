"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/lib/prisma";
import { escalateSeverity, type Severity } from "@/lib/state-machine";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import {
  ConfirmRepeatSchema,
  DismissRepeatSchema,
  type ConfirmRepeatInput,
  type DismissRepeatInput,
} from "./schemas";

type ConfirmResult =
  | {
      success: true;
      data: { id: string; escalatedSeverity: Severity; wasEscalated: boolean };
    }
  | { success: false; error: string };

type DismissResult = { success: true } | { success: false; error: string };

/**
 * Confirm a repeat finding suggestion (OBS-10, OBS-11).
 *
 * Links the new observation to the old one and auto-escalates severity:
 * - 2nd occurrence: +1 level (LOW->MEDIUM, MEDIUM->HIGH, HIGH->CRITICAL)
 * - 3rd+ occurrence: always CRITICAL
 *
 * Creates timeline entries for both the repeat confirmation and any
 * severity escalation, providing full audit trail.
 *
 * @param input - New observation ID, old observation ID, version for optimistic lock
 * @returns Escalated severity and whether escalation occurred, or error
 */
export async function confirmRepeatFinding(
  input: ConfirmRepeatInput,
): Promise<ConfirmResult> {
  const parsed = ConfirmRepeatSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const session = await getRequiredSession();
  const userRoles = session.user.roles ?? [];
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, error: "No tenant context found" };
  }

  // Validate AUDITOR role
  if (!userRoles.includes("AUDITOR") && !userRoles.includes("AUDIT_MANAGER")) {
    return {
      success: false,
      error: "Only auditors can confirm repeat findings",
    };
  }

  const { observationId, repeatOfId, version } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch both observations
    const [newObs, oldObs] = await Promise.all([
      db.observation.findFirst({
        where: { id: observationId, tenantId },
      }),
      db.observation.findFirst({
        where: { id: repeatOfId, tenantId },
      }),
    ]);

    if (!newObs) {
      return { success: false, error: "Observation not found" };
    }
    if (!oldObs) {
      return {
        success: false,
        error: "Referenced repeat observation not found",
      };
    }

    // Count total CLOSED observations matching branch + audit area of old observation
    const closedCount = await db.observation.count({
      where: {
        tenantId,
        branchId: oldObs.branchId,
        auditAreaId: oldObs.auditAreaId,
        status: "CLOSED",
      },
    });

    // Calculate escalated severity: occurrenceCount = closedCount + 1 (including this new one)
    const occurrenceCount = closedCount + 1;
    const originalSeverity = newObs.severity as Severity;
    const escalatedSeverity = escalateSeverity(
      originalSeverity,
      occurrenceCount,
    );
    const wasEscalated = escalatedSeverity !== originalSeverity;

    // Atomic transaction: update observation + create timeline entries
    await withAuditedMutation(
      userActor(session),
      "observation.repeat_confirmed",
      async (tx: any) => {
        // Update observation with optimistic lock
        const updated = await tx.observation.updateMany({
          where: { id: observationId, tenantId, version },
          data: {
            ...(wasEscalated ? { severity: escalatedSeverity } : {}),
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) {
          throw new Error(
            "Observation was modified by another user. Please refresh and try again.",
          );
        }

        // Timeline entry: repeat confirmed
        await tx.observationTimeline.create({
          data: {
            observationId,
            tenantId,
            event: "repeat_confirmed",
            oldValue: null,
            newValue: repeatOfId,
            comment: `Confirmed as repeat of "${oldObs.title}". Occurrence #${occurrenceCount}.`,
            createdById: session.user.id,
          },
        });

        // Timeline entry: severity escalated (only if severity changed)
        if (wasEscalated) {
          await tx.observationTimeline.create({
            data: {
              observationId,
              tenantId,
              event: "severity_escalated",
              oldValue: originalSeverity,
              newValue: escalatedSeverity,
              comment: `Auto-escalated due to repeat finding (occurrence #${occurrenceCount})`,
              createdById: session.user.id,
            },
          });
        }
      },
    );

    revalidatePath("/findings");
    revalidatePath(`/findings/${observationId}`);

    return {
      success: true,
      data: { id: observationId, escalatedSeverity, wasEscalated },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to confirm repeat finding";
    return { success: false, error: message };
  }
}

/**
 * Dismiss a repeat finding suggestion (OBS-11).
 *
 * Records the auditor's decision to not classify an observation as a repeat
 * in the timeline. No severity change occurs — the auditor is explicitly
 * choosing not to treat it as a repeat, and that decision is recorded
 * for audit trail purposes.
 *
 * @param input - Observation ID and the dismissed repeat-of ID
 * @returns Success or error
 */
export async function dismissRepeatFinding(
  input: DismissRepeatInput,
): Promise<DismissResult> {
  const parsed = DismissRepeatSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const session = await getRequiredSession();
  const userRoles = session.user.roles ?? [];
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, error: "No tenant context found" };
  }

  // Validate AUDITOR role
  if (!userRoles.includes("AUDITOR") && !userRoles.includes("AUDIT_MANAGER")) {
    return {
      success: false,
      error: "Only auditors can dismiss repeat findings",
    };
  }

  const { observationId, repeatOfId } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Verify observation exists
    const obs = await db.observation.findFirst({
      where: { id: observationId, tenantId },
    });

    if (!obs) {
      return { success: false, error: "Observation not found" };
    }

    // Create timeline entry for dismissal
    await db.observationTimeline.create({
      data: {
        observationId,
        tenantId,
        event: "repeat_dismissed",
        oldValue: null,
        newValue: repeatOfId,
        comment: "Repeat finding suggestion dismissed by auditor",
        createdById: session.user.id,
      },
    });

    revalidatePath("/findings");
    revalidatePath(`/findings/${observationId}`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to dismiss repeat finding";
    return { success: false, error: message };
  }
}
