import { describe, it, expect, vi, beforeEach } from "vitest";

const { hash } = vi.hoisted(() => ({
  hash: vi.fn(async (plain: string) => `scrypt:${plain}`),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.1" })),
}));
vi.mock("@/lib/auth", () => ({
  auth: { $context: Promise.resolve({ password: { hash } }) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(async () => true), hash: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  },
  prismaForTenant: vi.fn(),
}));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn(),
}));
vi.mock("@/lib/invitation-mailer", () => ({ sendInvitationEmail: vi.fn() }));

import { acceptInvitation } from "../user-invitations";
import { prisma } from "@/lib/prisma";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { TENANT_A, USER_A, fakeDb } from "@/test/factories";

const INVITED_USER = {
  id: USER_A,
  email: "asha@ucb.example",
  tenantId: TENANT_A,
  status: "INVITED",
  inviteTokenHash: "$2b$12$hashedtoken",
  inviteExpiry: new Date(Date.now() + 86_400_000),
};

/** Runs the audited callback against a fake tx and exposes the doubles. */
function stubAuditedMutation(activatedCount: number) {
  const tx = fakeDb({
    user: {
      updateMany: vi.fn(async () => ({ count: activatedCount })),
    },
    account: { upsert: vi.fn(async () => ({ id: "account-1" })) },
  });
  vi.mocked(withAuditedMutation).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (_actor: unknown, _action: unknown, fn: any) => fn(tx)) as never,
  );
  return tx;
}

describe("acceptInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(INVITED_USER as never);
  });

  it("writes a Better Auth credential account alongside activation", async () => {
    const tx = stubAuditedMutation(1);

    const result = await acceptInvitation(
      "raw-token",
      "asha@ucb.example",
      "Branch2026audit",
    );

    expect(result.success).toBe(true);
    expect(hash).toHaveBeenCalledWith("Branch2026audit");
    expect(tx.account.upsert).toHaveBeenCalledWith({
      where: {
        accountId_providerId: { accountId: USER_A, providerId: "credential" },
      },
      create: {
        userId: USER_A,
        accountId: USER_A,
        providerId: "credential",
        password: "scrypt:Branch2026audit",
      },
      update: {
        password: "scrypt:Branch2026audit",
      },
    });
  });

  it("activates only from INVITED, so a second acceptance is refused", async () => {
    stubAuditedMutation(0);

    const result = await acceptInvitation(
      "raw-token",
      "asha@ucb.example",
      "Branch2026audit",
    );

    expect(result).toEqual({
      success: false,
      error: "This invitation has already been used.",
    });
  });

  it("refuses a password that fails the policy before touching the database", async () => {
    const result = await acceptInvitation(
      "raw-token",
      "asha@ucb.example",
      "short",
    );

    expect(result).toEqual({
      success: false,
      error: "Password must be at least 8 characters.",
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
