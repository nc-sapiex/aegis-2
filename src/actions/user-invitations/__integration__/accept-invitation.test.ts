import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { verifyPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTenant,
  integrationPrisma,
  resetDatabase,
  withFixtures,
} from "../../../../tests/integration/harness";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })),
}));

async function seedInvitedUser(options?: {
  tenantId?: string | null;
  token?: string;
  inviteExpiry?: Date | null;
}) {
  const email = `invitee-${randomUUID()}@example.test`;
  const token = options?.token ?? `token-${randomUUID()}`;
  const tokenHash = await bcrypt.hash(token, 12);
  const inviteExpiry = options?.inviteExpiry ?? new Date(Date.now() + 60_000);

  const user = await withFixtures(() =>
    integrationPrisma.user.create({
      data: {
        email,
        name: "Invited User",
        roles: ["AUDITOR"],
        status: "INVITED",
        tenantId: options?.tenantId ?? null,
        invitedAt: new Date(),
        inviteTokenHash: tokenHash,
        inviteExpiry,
      },
      select: { id: true, email: true },
    }),
  );

  return { user, token };
}

describe("acceptInvitation integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("activates the user and stores a verifiable credential account", async () => {
    const tenant = await createTenant();
    const { user, token } = await seedInvitedUser({ tenantId: tenant.id });
    const password = "InvitePass1!";

    const { acceptInvitation } = await import("../../user-invitations");
    const result = await acceptInvitation(token, user.email, password);

    expect(result).toEqual({ success: true, error: null });

    const afterUser = await integrationPrisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        status: true,
        inviteTokenHash: true,
        inviteExpiry: true,
        emailVerified: true,
      },
    });
    expect(afterUser).toMatchObject({
      status: "ACTIVE",
      inviteTokenHash: null,
      inviteExpiry: null,
      emailVerified: true,
    });

    const accounts = await integrationPrisma.account.findMany({
      where: { userId: user.id, providerId: "credential" },
      select: { password: true },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].password).toBeTruthy();
    expect(
      await verifyPassword({
        hash: accounts[0].password!,
        password,
      }),
    ).toBe(true);
  });

  it("lets exactly one of two concurrent acceptances win", async () => {
    const tenant = await createTenant();
    const { user, token } = await seedInvitedUser({ tenantId: tenant.id });
    const password = "InvitePass1!";

    const { acceptInvitation } = await import("../../user-invitations");
    const [a, b] = await Promise.all([
      acceptInvitation(token, user.email, password),
      acceptInvitation(token, user.email, password),
    ]);

    expect([a, b].filter((r) => r.success)).toHaveLength(1);
    expect([a, b].filter((r) => !r.success)).toContainEqual({
      success: false,
      error: "This invitation has already been used.",
    });
    expect(
      await integrationPrisma.account.count({
        where: { userId: user.id, providerId: "credential" },
      }),
    ).toBe(1);
  });

  it("rejects an invalid token", async () => {
    const tenant = await createTenant();
    const { user } = await seedInvitedUser({
      tenantId: tenant.id,
      token: "good-token",
    });

    const { acceptInvitation } = await import("../../user-invitations");
    const result = await acceptInvitation(
      "wrong-token",
      user.email,
      "InvitePass1!",
    );

    expect(result).toEqual({
      success: false,
      error: "Invalid invitation token.",
    });
  });

  it("rejects an expired invitation", async () => {
    const tenant = await createTenant();
    const { user, token } = await seedInvitedUser({
      tenantId: tenant.id,
      inviteExpiry: new Date(Date.now() - 1_000),
    });

    const { acceptInvitation } = await import("../../user-invitations");
    const result = await acceptInvitation(token, user.email, "InvitePass1!");

    expect(result).toEqual({
      success: false,
      error: "Invitation has expired. Please request a new one.",
    });
  });

  it("rejects an invitation without a tenant", async () => {
    const { user, token } = await seedInvitedUser({ tenantId: null });

    const { acceptInvitation } = await import("../../user-invitations");
    const result = await acceptInvitation(token, user.email, "InvitePass1!");

    expect(result).toEqual({
      success: false,
      error: "Invitation is not linked to a bank.",
    });
  });
});
