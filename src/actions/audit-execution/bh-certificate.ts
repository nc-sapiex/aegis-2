"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import {
  requireBranchAssignment,
  requireTeamMembership,
} from "@/data-access/access-guards";
import { logger } from "@/lib/logger";
import type { Role } from "@/generated/prisma/enums";
import {
  SignBhCertificateSchema,
  CountersignBhCertificateSchema,
  type SignBhCertificateInput,
  type CountersignBhCertificateInput,
} from "./schemas";

/**
 * Sign BH Certificate
 *
 * Security:
 * - Only users with BRANCH_HEAD role can sign
 * - TenantId sourced from session (cannot be spoofed)
 * - Engagement must not already be signed
 *
 * Atomicity:
 * - Sets bhCertSignedById, bhCertSignedAt, bhCertComments
 * - Records audit context: bh_certificate.signed
 *
 * Returns: { success, data?, error? }
 */
export async function signBhCertificate(input: SignBhCertificateInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Role Check ──────────────────────────────────────
  if (!userRoles.includes("BRANCH_HEAD")) {
    return {
      success: false as const,
      error: "Only Branch Heads can sign the BH Certificate.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = SignBhCertificateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }
  const validated = parsed.data;

  // ─── Step 4: Tenant-Scoped Database ────────────────────────────
  const db = prismaForTenant(tenantId);

  // ─── Step 5: Resolve the engagement and authorize the branch ───
  try {
    const engagement = await db.auditEngagement.findFirst({
      where: { id: validated.engagementId, tenantId },
      select: { id: true, branchId: true, bhCertSignedAt: true },
    });

    if (!engagement) {
      throw new Error("Engagement not found");
    }

    if (engagement.bhCertSignedAt) {
      throw new Error("BH Certificate has already been signed");
    }

    // The BRANCH_HEAD role is tenant-wide; the certificate is not.
    const branchGuard = await requireBranchAssignment(
      { userId: session.user.id, tenantId },
      engagement.branchId,
    );

    if (!branchGuard.ok) {
      return { success: false as const, error: branchGuard.error };
    }

    // ─── Step 6: Transaction (Atomic Operation) ────────────────────
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "bh_certificate.signed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Update engagement with signature, predicated on it still being
      // unsigned so two branch heads cannot both claim the signature.
      const signed = await tx.auditEngagement.updateMany({
        where: {
          id: validated.engagementId,
          tenantId,
          bhCertSignedAt: null,
        },
        data: {
          bhCertSignedById: session.user.id,
          bhCertSignedAt: new Date(),
          bhCertComments: validated.comments,
        },
      });

      if (signed.count !== 1) {
        throw new Error("BH Certificate has already been signed");
      }

      const updated = await tx.auditEngagement.findFirst({
        where: { id: validated.engagementId, tenantId },
        select: { id: true, bhCertSignedAt: true },
      });

      return {
        signedAt: updated!.bhCertSignedAt!,
        signedBy: session.user.name,
      };
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath(`/audit-execution/${validated.engagementId}/bh-certificate`);

    // ─── Step 7: Success Response ──────────────────────────────
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    logger.error(
      { error, engagementId: validated.engagementId, tenantId },
      "Failed to sign BH Certificate",
    );

    const message =
      error instanceof Error
        ? error.message
        : "Failed to sign BH Certificate. Please try again.";
    return {
      success: false as const,
      error: message,
    };
  }
}

/**
 * Countersign BH Certificate
 *
 * Security:
 * - Only users with LEAD_AUDITOR or AUDIT_MANAGER role can countersign
 * - TenantId sourced from session (cannot be spoofed)
 * - Certificate must already be signed but not countersigned
 *
 * Atomicity:
 * - Sets bhCertCountersignedById, bhCertCountersignedAt
 * - Records audit context: bh_certificate.countersigned
 *
 * Returns: { success, data?, error? }
 */
export async function countersignBhCertificate(
  input: CountersignBhCertificateInput,
) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Role Check ──────────────────────────────────────
  if (
    !userRoles.includes("LEAD_AUDITOR") &&
    !userRoles.includes("AUDIT_MANAGER")
  ) {
    return {
      success: false as const,
      error:
        "Only Lead Auditors or Audit Managers can countersign the BH Certificate.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = CountersignBhCertificateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }
  const validated = parsed.data;

  // LEAD_AUDITOR is an engagement role and must be on this engagement's team.
  // AUDIT_MANAGER is a tenant-wide oversight role and is not enrolled in
  // AuditTeamMember, so it is exempt.
  if (!userRoles.includes("AUDIT_MANAGER")) {
    const teamGuard = await requireTeamMembership(
      { userId: session.user.id, tenantId: session.user.tenantId },
      validated.engagementId,
    );

    if (!teamGuard.ok) {
      return { success: false as const, error: teamGuard.error };
    }
  }

  // ─── Step 4: Tenant-Scoped Database ────────────────────────────
  const db = prismaForTenant(tenantId);

  // ─── Step 5: Transaction (Atomic Operation) ────────────────────
  try {
    const result = await db.$transaction(async (tx: any) => {
      // Verify engagement exists, is signed, but not countersigned
      const engagement = await tx.auditEngagement.findFirst({
        where: {
          id: validated.engagementId,
          tenantId,
        },
        select: {
          id: true,
          bhCertSignedAt: true,
          bhCertSignedById: true,
          bhCertCountersignedAt: true,
        },
      });

      if (!engagement) {
        throw new Error("Engagement not found");
      }

      if (!engagement.bhCertSignedAt) {
        throw new Error("BH Certificate must be signed before countersigning");
      }

      if (engagement.bhCertCountersignedAt) {
        throw new Error("BH Certificate has already been countersigned");
      }

      // A user holding both BRANCH_HEAD and AUDIT_MANAGER could otherwise sign
      // and countersign the same certificate.
      if (engagement.bhCertSignedById === session.user.id) {
        throw new Error(
          "You signed this certificate; a different user must countersign it.",
        );
      }

      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "bh_certificate.countersigned",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Update engagement with countersignature
      const now = new Date();
      const updated = await tx.auditEngagement.update({
        where: { id: validated.engagementId },
        data: {
          bhCertCountersignedById: session.user.id,
          bhCertCountersignedAt: now,
        },
        select: {
          id: true,
          bhCertCountersignedAt: true,
        },
      });

      return {
        countersignedAt: updated.bhCertCountersignedAt!,
        countersignedBy: session.user.name,
      };
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath(`/audit-execution/${validated.engagementId}/bh-certificate`);

    // ─── Step 7: Success Response ──────────────────────────────
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    logger.error(
      { error, engagementId: validated.engagementId, tenantId },
      "Failed to countersign BH Certificate",
    );

    const message =
      error instanceof Error
        ? error.message
        : "Failed to countersign BH Certificate. Please try again.";
    return {
      success: false as const,
      error: message,
    };
  }
}

/**
 * Get BH Certificate Status
 *
 * Read-only action to fetch current BH certificate state.
 *
 * Returns: { status, signedBy, signedAt, comments, countersignedBy, countersignedAt }
 */
export async function getBhCertificateStatus(engagementId: string) {
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  try {
    const engagement = await db.auditEngagement.findFirst({
      where: {
        id: engagementId,
        tenantId,
      },
      select: {
        bhCertSignedById: true,
        bhCertSignedAt: true,
        bhCertComments: true,
        bhCertCountersignedById: true,
        bhCertCountersignedAt: true,
      },
    });

    if (!engagement) {
      return {
        success: false as const,
        error: "Engagement not found",
      };
    }

    // Derive status
    let status: "PENDING" | "SIGNED" | "COUNTERSIGNED" = "PENDING";
    if (engagement.bhCertCountersignedAt) {
      status = "COUNTERSIGNED";
    } else if (engagement.bhCertSignedAt) {
      status = "SIGNED";
    }

    return {
      success: true as const,
      data: {
        status,
        signedBy: engagement.bhCertSignedById,
        signedAt: engagement.bhCertSignedAt,
        comments: engagement.bhCertComments,
        countersignedBy: engagement.bhCertCountersignedById,
        countersignedAt: engagement.bhCertCountersignedAt,
      },
    };
  } catch (error) {
    logger.error(
      { error, engagementId, tenantId },
      "Failed to get BH certificate status",
    );

    return {
      success: false as const,
      error: "Failed to get certificate status. Please try again.",
    };
  }
}
