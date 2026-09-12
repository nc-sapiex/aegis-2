import "server-only";

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/lib/permissions";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_HASH_COST = 12;

/**
 * Mint an invite token: a raw bearer credential and its bcrypt hash.
 *
 * Called before opening a transaction — bcrypt at this cost is slow, and
 * running it while a DB transaction holds a connection open is a cost worth
 * avoiding. The raw token exists only long enough to email it; only the hash
 * is ever persisted.
 */
export async function mintInviteToken(): Promise<{
  rawToken: string;
  tokenHash: string;
}> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, TOKEN_HASH_COST);
  return { rawToken, tokenHash };
}

export interface InvitedUserInput {
  name: string;
  email: string;
  roles: Role[];
  branchAssignments?: string[];
  tokenHash: string;
}

export interface CreatedInvitedUser {
  id: string;
  email: string;
  name: string;
  inviteExpiry: Date;
}

/**
 * Create invited users on the caller's already-open transaction.
 *
 * Does not open its own transaction — `User` and `UserBranchAssignment` carry
 * audit_trigger, so the caller's own `withAuditedMutation` must already have
 * set the session context on `tx` before this runs. Writes no audit-log row of
 * its own; the trigger records one per table write.
 */
export async function createInvitedUsers(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    invitedBy: string;
    invites: InvitedUserInput[];
  },
): Promise<CreatedInvitedUser[]> {
  const { tenantId, invitedBy, invites } = params;
  const invitedAt = new Date();
  const inviteExpiry = new Date(Date.now() + INVITE_EXPIRY_MS);

  const created: CreatedInvitedUser[] = [];
  for (const invite of invites) {
    const user = await tx.user.create({
      data: {
        email: invite.email,
        name: invite.name,
        roles: invite.roles,
        tenantId,
        status: "INVITED",
        invitedAt,
        invitedBy,
        inviteTokenHash: invite.tokenHash,
        inviteExpiry,
      },
    });

    if (
      invite.roles.includes("AUDITEE" as Role) &&
      invite.branchAssignments &&
      invite.branchAssignments.length > 0
    ) {
      const branches = await tx.branch.findMany({
        where: { tenantId, code: { in: invite.branchAssignments } },
      });

      for (const branch of branches) {
        await tx.userBranchAssignment.create({
          data: { userId: user.id, branchId: branch.id, tenantId },
        });
      }
    }

    created.push({
      id: user.id,
      email: user.email,
      name: user.name,
      inviteExpiry,
    });
  }

  return created;
}
