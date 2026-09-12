import "server-only";
import { prismaForTenant } from "@/lib/prisma";

export type GuardResult = { ok: true } | { ok: false; error: string };

/** The subject of a guard check, always taken from the authenticated session. */
export interface GuardActor {
  userId: string;
  tenantId: string;
}

/**
 * Require the actor to hold an assignment to this specific branch.
 *
 * A role is tenant-wide: BRANCH_HEAD says "runs a branch", not "runs this
 * branch". An unresolvable branch is refused rather than waved through,
 * because that is precisely the case where scope cannot be proven.
 */
export async function requireBranchAssignment(
  actor: GuardActor,
  branchId: string | null,
): Promise<GuardResult> {
  if (!branchId) {
    return {
      ok: false,
      error:
        "This record is not linked to a branch, so branch access cannot be verified.",
    };
  }

  const db = prismaForTenant(actor.tenantId);
  const assignment = await db.userBranchAssignment.findFirst({
    where: { userId: actor.userId, branchId, tenantId: actor.tenantId },
    select: { id: true },
  });

  return assignment
    ? { ok: true }
    : { ok: false, error: "You are not assigned to this branch." };
}

/** Require the actor to be on the engagement's audit team. */
export async function requireTeamMembership(
  actor: GuardActor,
  engagementId: string,
): Promise<GuardResult> {
  const db = prismaForTenant(actor.tenantId);
  const membership = await db.auditTeamMember.findFirst({
    where: { engagementId, userId: actor.userId, tenantId: actor.tenantId },
    select: { id: true },
  });

  return membership
    ? { ok: true }
    : {
        ok: false,
        error: "You are not on the audit team for this engagement.",
      };
}
