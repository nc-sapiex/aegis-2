"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getOnboardingSession } from "@/data-access/session";
import {
  completeOnboardingTransaction,
  saveOnboardingProgress,
  getOnboardingProgressFromDb,
  type OnboardingCompletionData,
} from "@/data-access/onboarding";
import { checklistItems } from "@/data/rbi-master-directions";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";

/**
 * Onboarding provisions the tenant: it overwrites the bank profile, creates
 * branches and audit areas, and mints users with caller-supplied roles. That is
 * a tenant-configuration operation, so both entry points gate on
 * `admin:manage_settings` (held by CAE and SYSTEM_ADMIN). Without the gate any
 * authenticated tenant user could replay onboarding to grant themselves an
 * admin role.
 */
const ONBOARDING_PERMISSION = "admin:manage_settings" as const;
const ONBOARDING_FORBIDDEN =
  "You do not have permission to configure onboarding.";

/**
 * Server Actions for the Onboarding Wizard
 *
 * Actions:
 * - saveWizardStep: Save wizard step data to OnboardingProgress
 * - getWizardProgress: Retrieve saved wizard state
 * - completeOnboarding: Atomic completion (tenant + compliance + users)
 */

// ─── Save Wizard Step ───────────────────────────────────────────────────────

export async function saveWizardStep(
  step: number,
  data: Record<string, unknown>,
) {
  const session = await getOnboardingSession();
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, error: "No tenant associated with this user." };
  }

  if (!hasPermission(session.user.roles, ONBOARDING_PERMISSION)) {
    return { success: false, error: ONBOARDING_FORBIDDEN };
  }

  try {
    await saveOnboardingProgress(tenantId, step, data);
    return { success: true, error: null };
  } catch (error) {
    logger.error(
      { error, action: "save_onboarding_step", tenantId, step },
      "Failed to save onboarding step",
    );
    return { success: false, error: "Failed to save progress." };
  }
}

// ─── Get Wizard Progress ────────────────────────────────────────────────────

export async function getWizardProgress() {
  const session = await getOnboardingSession();
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, data: null, error: "No tenant found." };
  }

  try {
    const progress = await getOnboardingProgressFromDb(tenantId);
    return { success: true, data: progress, error: null };
  } catch (error) {
    logger.error(
      { error, action: "get_onboarding_progress", tenantId },
      "Failed to get onboarding progress",
    );
    return { success: false, data: null, error: "Failed to load progress." };
  }
}

// ─── Complete Onboarding ────────────────────────────────────────────────────

interface CompleteOnboardingInput {
  bankRegistration: OnboardingCompletionData["bankRegistration"];
  tierSelection: OnboardingCompletionData["tierSelection"];
  selectedDirections: {
    masterDirectionId: string;
    selected: boolean;
    items: {
      itemCode: string;
      selected: boolean;
      notApplicable: boolean;
      notApplicableReason?: string;
    }[];
  }[];
  departments: OnboardingCompletionData["departments"];
  branches: OnboardingCompletionData["branches"];
  invitedUsers: OnboardingCompletionData["invitedUsers"];
}

export async function completeOnboarding(input: CompleteOnboardingInput) {
  const session = await getOnboardingSession();
  const tenantId = session.user.tenantId;

  if (!tenantId) {
    return { success: false, error: "No tenant associated with this user." };
  }

  if (!hasPermission(session.user.roles, ONBOARDING_PERMISSION)) {
    return { success: false, error: ONBOARDING_FORBIDDEN };
  }

  try {
    // Build selected items list from directions
    const selectedItems: OnboardingCompletionData["selectedItems"] = [];

    for (const dir of input.selectedDirections) {
      if (!dir.selected) continue;
      for (const item of dir.items) {
        if (item.notApplicable) {
          selectedItems.push({
            itemCode: item.itemCode,
            notApplicableReason: item.notApplicableReason,
          });
        } else if (item.selected) {
          // Enrich with checklist item data
          const template = checklistItems.find(
            (ci) => ci.itemCode === item.itemCode,
          );
          if (template) {
            selectedItems.push({ itemCode: item.itemCode });
          }
        }
      }
    }

    const headersList = await headers();
    const ipAddress = headersList.get("x-forwarded-for") ?? "unknown";

    const completionData: OnboardingCompletionData = {
      tenantId,
      bankRegistration: input.bankRegistration,
      tierSelection: input.tierSelection,
      selectedItems,
      departments: input.departments,
      branches: input.branches,
      invitedUsers: input.invitedUsers,
      userId: session.user.id,
      sessionId: session.session.id,
      ipAddress,
    };

    const result = await completeOnboardingTransaction(completionData);

    revalidatePath("/dashboard");
    revalidatePath("/compliance");

    return {
      success: true,
      error: null,
      data: result,
    };
  } catch (error) {
    logger.error(
      { error, action: "complete_onboarding", tenantId },
      "Failed to complete onboarding",
    );
    return {
      success: false,
      error: "Failed to complete onboarding. Please try again.",
    };
  }
}
