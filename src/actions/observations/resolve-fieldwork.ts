"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { ResolveFieldworkSchema } from "./schemas";
import type { ResolveFieldworkInput } from "./schemas";
import { logger } from "@/lib/logger";

/**
 * Mark an observation as resolved during fieldwork (OBS-07).
 *
 * Only pre-issued observations (DRAFT or SUBMITTED) can be resolved.
 * Uses optimistic locking to prevent concurrent modifications.
 *
 * @returns { success, data?, error? } — never throws
 */
export async function resolveFieldwork(input: ResolveFieldworkInput) {
  // Step 1: Auth
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Step 2: Permission check — AUDITOR or AUDIT_MANAGER can resolve
  const canResolve =
    hasPermission(userRoles, "observation:create") ||
    hasPermission(userRoles, "observation:review");
  if (!canResolve) {
    return {
      success: false as const,
      error: "You do not have permission to resolve observations.",
    };
  }

  // Step 3: Validate input
  const parsed = ResolveFieldworkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch current observation to validate state
    const observation = await db.observation.findFirst({
      where: {
        id: validated.observationId,
        tenantId,
      },
      select: { id: true, status: true, version: true },
    });

    if (!observation) {
      return {
        success: false as const,
        error: "Observation not found.",
      };
    }

    // Only pre-issued observations can be resolved during fieldwork
    if (observation.status !== "DRAFT" && observation.status !== "SUBMITTED") {
      return {
        success: false as const,
        error:
          "Only observations in DRAFT or SUBMITTED state can be resolved during fieldwork.",
      };
    }

    // Optimistic lock check
    if (observation.version !== validated.version) {
      return {
        success: false as const,
        error:
          "Observation was modified by another user. Please refresh and try again.",
      };
    }

    await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "observation.updated",
        justification: validated.resolutionReason,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Update observation — atomic version increment
      await tx.observation.update({
        where: {
          id: validated.observationId,
          tenantId,
        },
        data: {
          resolvedDuringFieldwork: true,
          resolutionReason: validated.resolutionReason,
          version: { increment: 1 },
        },
      });

      // Create timeline entry
      await tx.observationTimeline.create({
        data: {
          observationId: validated.observationId,
          tenantId,
          event: "resolved_during_fieldwork",
          comment: validated.resolutionReason,
          createdById: session.user.id,
        },
      });
    });

    revalidatePath("/findings");
    revalidatePath(`/findings/${validated.observationId}`);
    return {
      success: true as const,
      data: { id: validated.observationId },
    };
  } catch (error) {
    logger.error(
      {
        error,
        action: "resolve_fieldwork",
        tenantId,
        observationId: validated.observationId,
      },
      "Failed to resolve observation",
    );
    return {
      success: false as const,
      error: "Failed to resolve observation. Please try again.",
    };
  }
}
