"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { type Role } from "@/lib/permissions";
import {
  canTransition,
  type ObservationStatus,
  type Severity,
} from "@/lib/state-machine";
import { checkObservationTransition } from "@/lib/maker-checker";
import { TransitionObservationSchema } from "./schemas";
import type { TransitionObservationInput } from "./schemas";
import { createNotification } from "@/data-access/notifications";
import { logger } from "@/lib/logger";

/**
 * Generic state transition action for observations (OBS-02 through OBS-06).
 *
 * Handles all 8 transitions (6 forward + 2 return) through the state machine.
 * Each transition:
 * 1. Validates auth and roles via canTransition()
 * 2. Uses optimistic locking (version field)
 * 3. Atomically updates status + creates timeline entry
 *
 * @returns { success, data?, error? } — never throws
 */
export async function transitionObservation(input: TransitionObservationInput) {
  // Step 1: Auth
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Step 2: Validate input
  const parsed = TransitionObservationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch current observation with tenant scope (belt-and-suspenders)
    const observation = await db.observation.findFirst({
      where: {
        id: validated.observationId,
        tenantId,
      },
      select: {
        id: true,
        status: true,
        severity: true,
        version: true,
        createdById: true,
      },
    });

    if (!observation) {
      return {
        success: false as const,
        error: "Observation not found.",
      };
    }

    // Step 3: Validate transition via state machine
    const currentStatus = observation.status as ObservationStatus;
    const targetStatus = validated.targetStatus as ObservationStatus;
    const severity = observation.severity as Severity;

    const transitionResult = canTransition(
      currentStatus,
      targetStatus,
      userRoles,
      severity,
    );

    if (!transitionResult.allowed) {
      return {
        success: false as const,
        error: transitionResult.reason,
      };
    }

    // Step 3b: Maker-checker — the raiser may not review, issue, or close
    // their own observation. createdById is immutable after creation, so the
    // value read above is still the value inside the transaction.
    const makerChecker = checkObservationTransition(
      currentStatus,
      targetStatus,
      session.user.id,
      { createdById: observation.createdById },
    );

    if (!makerChecker.allowed) {
      return {
        success: false as const,
        error: makerChecker.reason,
      };
    }

    // Step 4: Atomic transaction — the version and status predicates live in
    // the UPDATE itself, so two concurrent callers cannot both win. The
    // pre-read above is for the state machine only, never for locking.
    const outcome = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "observation.status_changed",
        justification: validated.comment,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        statusUpdatedAt: new Date(),
        version: { increment: 1 },
      };

      if (targetStatus === "RESPONSE") {
        if (validated.auditeeResponse) {
          updateData.auditeeResponse = validated.auditeeResponse;
        }
        if (validated.actionPlan) {
          updateData.actionPlan = validated.actionPlan;
        }
      }

      const { count } = await tx.observation.updateMany({
        where: {
          id: validated.observationId,
          tenantId,
          version: validated.version,
          status: currentStatus,
        },
        data: updateData,
      });

      if (count !== 1) return { changed: false as const };

      await tx.observationTimeline.create({
        data: {
          observationId: validated.observationId,
          tenantId,
          event: "status_changed",
          oldValue: currentStatus,
          newValue: targetStatus,
          comment: validated.comment,
          createdById: session.user.id,
        },
      });

      return { changed: true as const };
    });

    if (!outcome.changed) {
      return {
        success: false as const,
        error:
          "Observation was modified by another user. Please refresh and try again.",
      };
    }

    revalidatePath("/findings");
    revalidatePath(`/findings/${validated.observationId}`);

    // Side effects when observation is issued
    if (targetStatus === "ISSUED") {
      // Queue notification (NOTF-01)
      try {
        const obs = await db.observation.findFirst({
          where: { id: validated.observationId, tenantId },
          select: {
            title: true,
            severity: true,
            assignedToId: true,
            dueDate: true,
            condition: true,
            branchId: true,
            engagementId: true,
            branch: { select: { name: true } },
          },
        });
        if (obs?.assignedToId) {
          await createNotification(session, {
            recipientId: obs.assignedToId,
            type: "OBSERVATION_ASSIGNED",
            payload: {
              observationId: validated.observationId,
              observationTitle: obs.title,
              severity: obs.severity,
              branchName: obs.branch?.name ?? "",
              dueDate: obs.dueDate?.toISOString() ?? "",
              conditionExcerpt: (obs.condition ?? "").slice(0, 200),
            },
          });
        }

        // Auto-create ComplianceItem (ISS-004 / R35)
        if (obs) {
          const existingItem = await db.complianceItem.findFirst({
            where: { observationId: validated.observationId, tenantId },
            select: { id: true },
          });

          if (!existingItem) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            await db.complianceItem.create({
              data: {
                tenantId,
                observationId: validated.observationId,
                branchId: obs.branchId,
                auditId: obs.engagementId,
                status: "OPEN",
                dueDate,
                escalationLevel: 0,
                daysOpen: 0,
              },
            });

            logger.info(
              {
                observationId: validated.observationId,
                action: "auto_create_compliance_item",
              },
              "ComplianceItem auto-created on ISSUED transition",
            );
          }
        }
      } catch (e) {
        // Non-blocking: log but don't fail the transition
        logger.error(
          {
            error: e,
            action: "issued_side_effects",
            observationId: validated.observationId,
          },
          "Failed to complete ISSUED side effects (notification or compliance item)",
        );
      }
    }

    return {
      success: true as const,
      data: { id: validated.observationId, newStatus: targetStatus },
    };
  } catch (error) {
    logger.error(
      {
        error,
        action: "transition_observation",
        tenantId,
        observationId: validated.observationId,
      },
      "Failed to transition observation",
    );
    return {
      success: false as const,
      error: "Failed to update observation status. Please try again.",
    };
  }
}
