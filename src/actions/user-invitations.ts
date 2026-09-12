"use server";

import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import {
  mintInviteToken,
  createInvitedUsers,
  type InvitedUserInput,
} from "@/data-access/user-invitations";
import { auth } from "@/lib/auth";
import { PasswordSchema } from "@/lib/password-policy";
import { sendInvitationEmail } from "@/lib/invitation-mailer";
import { passwordValidationError } from "@/lib/credential-account";

/**
 * Server Actions for User Invitation Management (ONBD-04)
 *
 * Security:
 * - Invite tokens: random 32-byte hex, stored as bcrypt hash
 * - Token expiry: 7 days
 * - Single-use: cleared after acceptance
 * - Rate limiting: max 5 acceptance attempts per IP per hour
 *
 * Note: bcrypt is used for token hashing in production.
 * For prototype, we use a simple hash comparison placeholder.
 */

// ─── Send Invitations ───────────────────────────────────────────────────────

interface InviteUserInput {
  name: string;
  email: string;
  roles: string[];
  branchAssignments?: string[];
}

export async function sendUserInvitations(users: InviteUserInput[]) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "admin:manage_users")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { success: false, error: "No tenant found." };
  }

  try {
    // Minted before the transaction opens: bcrypt-12 is slow, and running it
    // while a DB transaction holds a connection open is a cost worth avoiding.
    const minted = await Promise.all(
      users.map(async (invite) => ({ invite, ...(await mintInviteToken()) })),
    );

    const createdUsers = await withAuditedMutation(
      userActor(session),
      "user.invited",
      (tx) =>
        createInvitedUsers(tx, {
          tenantId,
          invitedBy: session.user.id,
          invites: minted.map(
            ({ invite, tokenHash }): InvitedUserInput => ({
              name: invite.name,
              email: invite.email,
              roles: invite.roles as InvitedUserInput["roles"],
              branchAssignments: invite.branchAssignments,
              tokenHash,
            }),
          ),
        }),
    );

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { shortName: true },
    });

    // Sent after the transaction commits: SES is network I/O, and a transient
    // delivery failure must not roll back the user records.
    const rawTokenByEmail = new Map(
      minted.map(({ invite, rawToken }) => [invite.email, rawToken]),
    );
    for (const invitee of createdUsers) {
      await sendInvitationEmail({
        to: invitee.email,
        inviteeName: invitee.name,
        bankName: tenant?.shortName ?? "AEGIS",
        rawToken: rawTokenByEmail.get(invitee.email)!,
        expiresAt: invitee.inviteExpiry,
      });
    }

    return {
      success: true,
      error: null,
      data: createdUsers.map(({ id, email, name }) => ({ id, email, name })),
    };
  } catch (error) {
    logger.error(
      { error, action: "send_user_invitations", tenantId },
      "Failed to send user invitations",
    );
    return { success: false, error: "Failed to send invitations." };
  }
}

// ─── Accept Invitation ──────────────────────────────────────────────────────

/** Thrown inside the activation transaction to roll it back and report cleanly. */
const ALREADY_ACCEPTED = "INVITATION_ALREADY_ACCEPTED";

export async function acceptInvitation(
  token: string,
  email: string,
  password: string,
) {
  const passwordCheck = PasswordSchema.safeParse(password);
  if (!passwordCheck.success) {
    return { success: false, error: passwordCheck.error.issues[0].message };
  }

  try {
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      return { success: false, error: passwordError };
    }

    // Find user by email with INVITED status
    const user = await prisma.user.findFirst({
      where: {
        email,
        status: "INVITED",
        inviteTokenHash: { not: null },
      },
    });

    if (!user || !user.inviteTokenHash) {
      return { success: false, error: "Invalid or expired invitation." };
    }

    // Check token match using bcrypt
    const isValidToken = await bcrypt.compare(token, user.inviteTokenHash);
    if (!isValidToken) {
      return { success: false, error: "Invalid invitation token." };
    }

    // Check expiry
    if (user.inviteExpiry && user.inviteExpiry < new Date()) {
      return {
        success: false,
        error: "Invitation has expired. Please request a new one.",
      };
    }

    // An invited user always belongs to a tenant; fail cleanly rather than
    // asserting, since AuditLog.tenantId is NOT NULL.
    const tenantId = user.tenantId;
    if (!tenantId) {
      return { success: false, error: "Invitation is not linked to a bank." };
    }

    // Better Auth keeps credentials on Account and hashes with its own
    // configured algorithm. Hash through its context so the digest matches
    // what signIn.email will later verify — a bcrypt digest never would.
    const passwordHash = await (await auth.$context).password.hash(password);

    // Read before the transaction: an Actor carries the IP, and a throw here
    // must land before anything commits, not after.
    const ipAddress = (await headers()).get("x-forwarded-for") ?? undefined;

    // No auditLog.create follows this. "User" carries audit_trigger, so the
    // update below already writes the row, taking actionType and IP from the
    // session context. A manual row would duplicate it, and — landing after
    // the commit — would report a completed activation as a failure, sending
    // the user back to an invitation their own success has already consumed.
    await withAuditedMutation(
      // The invitee is not signed in; they are activating their own account,
      // so they are the honest Actor for this change.
      { kind: "user", userId: user.id, tenantId, ipAddress },
      "user.invitation_accepted",
      async (tx) => {
        // Predicated on INVITED so two concurrent acceptances cannot both
        // activate and write competing credential rows.
        const activated = await tx.user.updateMany({
          where: { id: user.id, status: "INVITED" },
          data: {
            status: "ACTIVE",
            inviteTokenHash: null,
            inviteExpiry: null,
            emailVerified: true,
          },
        });

        if (activated.count !== 1) {
          throw new Error(ALREADY_ACCEPTED);
        }

        // Same transaction as activation: a user left ACTIVE with no
        // credential can neither sign in nor be re-invited, because
        // resendInvitation only matches status INVITED.
        //
        // upsert (not create) guards against duplicate credential rows from
        // concurrent double-submission or prior script runs.  The unique key
        // is (accountId, providerId); on conflict the password hash is
        // refreshed so the user's chosen password always wins.
        await tx.account.upsert({
          where: {
            accountId_providerId: {
              accountId: user.id,
              providerId: "credential",
            },
          },
          create: {
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: passwordHash,
          },
          update: {
            password: passwordHash,
          },
        });
      },
    );

    return { success: true, error: null };
  } catch (error) {
    if (error instanceof Error && error.message === ALREADY_ACCEPTED) {
      return {
        success: false,
        error: "This invitation has already been used.",
      };
    }
    logger.error(
      { error, action: "accept_invitation", email },
      "Failed to activate account.",
    );
    return { success: false, error: "Failed to activate account." };
  }
}

// ─── Resend Invitation ──────────────────────────────────────────────────────

export async function resendInvitation(userId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "admin:manage_users")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, status: "INVITED" },
    });

    if (!user) {
      return { success: false, error: "User not found or already active." };
    }

    const { rawToken, tokenHash } = await mintInviteToken();
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Include tenantId in WHERE to prevent IDOR cross-tenant mutation
    await withAuditedMutation(
      userActor(session),
      "user.invitation_resent",
      (tx) =>
        tx.user.updateMany({
          where: { id: userId, tenantId },
          data: {
            inviteTokenHash: tokenHash,
            inviteExpiry: newExpiry,
          },
        }),
    );

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { shortName: true },
    });

    await sendInvitationEmail({
      to: user.email,
      inviteeName: user.name,
      bankName: tenant?.shortName ?? "AEGIS",
      rawToken,
      expiresAt: newExpiry,
    });

    return { success: true, error: null };
  } catch (error) {
    logger.error(
      { error, action: "resend_invitation", tenantId, userId },
      "Failed to resend invitation",
    );
    return { success: false, error: "Failed to resend invitation." };
  }
}

// ─── Revoke Invitation ──────────────────────────────────────────────────────

export async function revokeInvitation(userId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "admin:manage_users")) {
    return { success: false, error: "Insufficient permissions." };
  }

  const tenantId = session.user.tenantId;

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, status: "INVITED" },
    });

    if (!user) {
      return { success: false, error: "User not found or already active." };
    }

    const ipAddress = (await headers()).get("x-forwarded-for") ?? undefined;

    // Include tenantId in WHERE to prevent IDOR cross-tenant deletion.
    // The delete fires audit_trigger, which writes the AuditLog row from this
    // context — the Actor is spelled out rather than built by userActor so it
    // carries the IP and session id the trigger would otherwise record as NULL.
    await withAuditedMutation(
      {
        kind: "user",
        userId: session.user.id,
        tenantId,
        ipAddress,
        sessionId: session.session.id,
      },
      "user.invitation_revoked",
      (tx) => tx.user.deleteMany({ where: { id: userId, tenantId } }),
    );

    return { success: true, error: null };
  } catch (error) {
    logger.error(
      { error, action: "revoke_invitation", tenantId, userId },
      "Failed to revoke invitation",
    );
    return { success: false, error: "Failed to revoke invitation." };
  }
}
