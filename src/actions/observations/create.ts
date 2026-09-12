"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { CreateObservationSchema } from "./schemas";
import type { CreateObservationInput } from "./schemas";
import { logger } from "@/lib/logger";

/**
 * Create a new observation in DRAFT state with 5C fields (OBS-01).
 *
 * Security:
 * - Permission check: observation:create (AUDITOR role)
 * - tenantId from session only (S2)
 * - Zod validation for all inputs
 * - Audit context for tracking
 *
 * Atomic transaction:
 * 1. Create observation with status DRAFT, version 1
 * 2. Create initial timeline entry
 *
 * @returns { success, data?, error? } — never throws
 */
export async function createObservation(input: CreateObservationInput) {
  // Step 1: Auth
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Step 2: Permission check
  if (!hasPermission(userRoles, "observation:create")) {
    return {
      success: false as const,
      error: "You do not have permission to create observations.",
    };
  }

  // Step 3: Validate input
  const parsed = CreateObservationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;

  // Step 4: Tenant-scoped Prisma
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context
      await setAuditContext(tx, {
        actionType: "observation.created",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Create observation in DRAFT state
      const observation = await tx.observation.create({
        data: {
          tenantId,
          title: validated.title,
          condition: validated.condition,
          criteria: validated.criteria,
          cause: validated.cause,
          effect: validated.effect,
          recommendation: validated.recommendation,
          severity: validated.severity,
          status: "DRAFT",
          version: 1,
          branchId: validated.branchId ?? null,
          auditAreaId: validated.auditAreaId ?? null,
          assignedToId: validated.assignedToId ?? null,
          riskCategory: validated.riskCategory ?? null,
          dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
          createdById: session.user.id,
        },
      });

      // Create initial timeline entry
      await tx.observationTimeline.create({
        data: {
          observationId: observation.id,
          tenantId,
          event: "created",
          newValue: "DRAFT",
          comment: "Observation created",
          createdById: session.user.id,
        },
      });

      return observation;
    });

    revalidatePath("/findings");
    return {
      success: true as const,
      data: { id: result.id },
    };
  } catch (error) {
    logger.error(
      { error, action: "create_observation", tenantId },
      "Failed to create observation",
    );
    return {
      success: false as const,
      error: "Failed to create observation. Please try again.",
    };
  }
}
