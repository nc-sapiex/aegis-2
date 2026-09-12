import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { Role } from "@/generated/prisma/enums";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  integrationPrisma,
  withFixtures,
} from "../../../tests/integration/harness";

/**
 * One acceptance, one audit row (#93).
 *
 * `User` carries `audit_trigger`, so an audited update of it already writes an
 * AuditLog row. Both actions here used to add a second, near-identical row by
 * hand after the transaction had committed — duplicating the trigger's record,
 * and turning a post-commit throw into a "failed" result for work that had in
 * fact succeeded.
 *
 * These tests run with the triggers attached (fixtures are built through
 * `withFixtures`, which detaches them, so every row counted below comes from
 * the action itself). Counting is the point: an assertion that a row *exists*
 * passes just as happily with two.
 */

const CLIENT_IP = "203.0.113.7";

/** `next/headers` throws outside a request scope; the actions read the IP. */
function mockHeaders() {
  vi.doMock("next/headers", () => ({
    headers: async () => new Headers({ "x-forwarded-for": CLIENT_IP }),
  }));
}

async function seedInvitedUser(tenantId: string) {
  const rawToken = randomUUID();
  const inviteTokenHash = await bcrypt.hash(rawToken, 10);
  const user = await withFixtures(() =>
    integrationPrisma.user.create({
      data: {
        email: `invitee-${randomUUID()}@example.test`,
        name: "Invited User",
        tenantId,
        roles: ["AUDITEE"] as Role[],
        status: "INVITED",
        inviteTokenHash,
        inviteExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true },
    }),
  );
  return { ...user, rawToken };
}

describe("user-invitations audit rows", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("writes exactly one audit row for an acceptance, carrying the client IP", async () => {
    const tenant = await createTenant();
    const invited = await seedInvitedUser(tenant.id);

    // acceptInvitation is unauthenticated and never reads the session, but the
    // module imports it — mock so the real one is not pulled in.
    mockSessionModule(
      fakeSession({
        id: invited.id,
        tenantId: tenant.id,
        roles: ["AUDITEE"],
      }),
    );
    mockHeaders();
    const { acceptInvitation } = await import("../user-invitations");

    const result = await acceptInvitation(
      invited.rawToken,
      invited.email,
      "Branch2026audit",
    );
    expect(result).toEqual({ success: true, error: null });

    const rows = await integrationPrisma.auditLog.findMany({
      where: { tableName: "User", recordId: invited.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenant.id,
      operation: "UPDATE",
      actionType: "user.invitation_accepted",
      userId: invited.id,
      ipAddress: CLIENT_IP,
    });

    // Nothing else wrote an audit row either: Account carries no trigger.
    expect(await integrationPrisma.auditLog.count()).toBe(1);

    // The pairing that used to come apart: the success it reported is backed
    // by a committed activation, never a failure reported over one.
    const activated = await integrationPrisma.user.findUniqueOrThrow({
      where: { id: invited.id },
      select: { status: true, inviteTokenHash: true },
    });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.inviteTokenHash).toBeNull();
    expect(
      await integrationPrisma.account.count({
        where: { userId: invited.id, providerId: "credential" },
      }),
    ).toBe(1);
  });

  it("writes exactly one audit row per invited user, with no hand-written summary row", async () => {
    const tenant = await createTenant();
    const admin = await createUser(tenant.id, ["SYSTEM_ADMIN"]);
    const session = fakeSession({
      id: admin.id,
      tenantId: tenant.id,
      roles: ["SYSTEM_ADMIN"],
    });
    mockSessionModule(session);
    mockHeaders();
    vi.doMock("@/lib/invitation-mailer", () => ({
      sendInvitationEmail: vi.fn(async () => undefined),
    }));
    const { sendUserInvitations } = await import("../user-invitations");

    const result = await sendUserInvitations([
      { name: "Asha", email: "asha@ucb.example", roles: ["AUDITOR"] },
      { name: "Ravi", email: "ravi@ucb.example", roles: ["CCO"] },
    ]);

    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error("unreachable");
    expect(result.data).toHaveLength(2);

    for (const invitee of result.data) {
      const rows = await integrationPrisma.auditLog.findMany({
        where: { tableName: "User", recordId: invitee.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId: tenant.id,
        operation: "INSERT",
        actionType: "user.invited",
        userId: admin.id,
      });
    }

    // No hand-written summary row alongside the two per-user trigger rows —
    // exactly the bug #93 already fixed for accept and revoke.
    expect(await integrationPrisma.auditLog.count()).toBe(2);
  });

  it("writes exactly one audit row for a revocation, carrying IP and session", async () => {
    const tenant = await createTenant();
    const admin = await createUser(tenant.id, ["SYSTEM_ADMIN"]);
    const invited = await seedInvitedUser(tenant.id);

    const session = fakeSession({
      id: admin.id,
      tenantId: tenant.id,
      roles: ["SYSTEM_ADMIN"],
    });
    mockSessionModule(session);
    mockHeaders();
    const { revokeInvitation } = await import("../user-invitations");

    const result = await revokeInvitation(invited.id);
    expect(result).toEqual({ success: true, error: null });

    const rows = await integrationPrisma.auditLog.findMany({
      where: { tableName: "User", recordId: invited.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenant.id,
      operation: "DELETE",
      actionType: "user.invitation_revoked",
      userId: admin.id,
      ipAddress: CLIENT_IP,
      sessionId: session.session.id,
    });
  });
});
