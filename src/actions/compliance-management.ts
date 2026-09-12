"use server";

import { getRequiredSession } from "@/data-access/session";
import { hasPermission, type Role } from "@/lib/permissions";
import {
  createCustomRequirement,
  markRequirementNotApplicable,
  revertRequirementNotApplicable,
  getMasterDirectionsWithCounts,
  getMasterDirectionItems,
  searchRbiCirculars,
  getCustomRequirements,
} from "@/data-access/compliance-management";
import { logger } from "@/lib/logger";
import { userActor } from "@/data-access/audited-mutation";

/**
 * Server Actions for Compliance Management (CMPL-03, CMPL-04)
 *
 * Wraps DAL functions with session auth and permission checks.
 */

// ─── Custom Requirements (CMPL-04) ─────────────────────────────────────────

interface AddCustomRequirementInput {
  requirement: string;
  category: string;
  priority: string;
  frequency: string;
  title?: string;
  description?: string;
  rbiCircularId?: string;
}

export async function addCustomRequirement(input: AddCustomRequirementInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "compliance:update")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { success: false, error: "No tenant found." };
  }

  try {
    const result = await createCustomRequirement(userActor(session), {
      tenantId,
      ...input,
      ownerId: session.user.id,
    });
    return { success: true, error: null, data: result };
  } catch (error) {
    logger.error(
      { error, action: "add_custom_requirement", tenantId },
      "Failed to add custom requirement",
    );
    return { success: false, error: "Failed to add requirement." };
  }
}

// ─── N/A Marking (CMPL-03) ──────────────────────────────────────────────────

export async function markAsNotApplicable(
  requirementId: string,
  reason: string,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "compliance:update")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;

  try {
    await markRequirementNotApplicable(
      userActor(session),
      tenantId,
      requirementId,
      reason,
    );
    return { success: true, error: null };
  } catch (error) {
    logger.error(
      {
        error,
        action: "mark_requirement_not_applicable",
        tenantId,
        requirementId,
      },
      "Failed to mark requirement as N/A",
    );
    return { success: false, error: "Failed to update requirement." };
  }
}

export async function revertNotApplicable(requirementId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "compliance:update")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;

  try {
    await revertRequirementNotApplicable(
      userActor(session),
      tenantId,
      requirementId,
    );
    return { success: true, error: null };
  } catch (error) {
    logger.error(
      {
        error,
        action: "revert_requirement_not_applicable",
        tenantId,
        requirementId,
      },
      "Failed to revert N/A status",
    );
    return { success: false, error: "Failed to update requirement." };
  }
}

// ─── Master Directions (Read-Only) ──────────────────────────────────────────

export async function fetchMasterDirections() {
  await getRequiredSession(); // Auth gate

  try {
    const directions = await getMasterDirectionsWithCounts();
    return { success: true, error: null, data: directions };
  } catch (error) {
    logger.error(
      { error, action: "fetch_master_directions" },
      "Failed to fetch master directions",
    );
    return { success: false, error: "Failed to load master directions." };
  }
}

export async function fetchMasterDirectionItems(masterDirectionId: string) {
  await getRequiredSession(); // Auth gate

  try {
    const items = await getMasterDirectionItems(masterDirectionId);
    return { success: true, error: null, data: items };
  } catch (error) {
    logger.error(
      { error, action: "fetch_master_direction_items", masterDirectionId },
      "Failed to fetch checklist items",
    );
    return { success: false, error: "Failed to load checklist items." };
  }
}

// ─── RBI Circular Search ────────────────────────────────────────────────────

export async function searchCirculars(query: string) {
  await getRequiredSession(); // Auth gate

  try {
    const results = await searchRbiCirculars(query);
    return { success: true, error: null, data: results };
  } catch (error) {
    logger.error(
      { error, action: "search_rbi_circulars", query },
      "Failed to search RBI circulars",
    );
    return { success: false, error: "Failed to search." };
  }
}

// ─── Get Custom Requirements ────────────────────────────────────────────────

export async function fetchCustomRequirements() {
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  try {
    const requirements = await getCustomRequirements(tenantId);
    return { success: true, error: null, data: requirements };
  } catch (error) {
    logger.error(
      { error, action: "fetch_custom_requirements", tenantId },
      "Failed to fetch custom requirements",
    );
    return { success: false, error: "Failed to load requirements." };
  }
}
