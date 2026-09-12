import { describe, it, expect, vi, beforeEach } from "vitest";

// Guards the "wizard invitees can activate" behaviour: the completeOnboarding
// transaction must mint an activation token per invited user and email each one
// after the transaction commits. Without the token the wizard would create
// users who can never set a password.

// Hoisted so the (hoisted) vi.mock factories below can close over these spies.
const {
  tenantFindUnique,
  sendInvitationEmail,
  userCreate,
  bcryptHash,
  fakeTx,
} = vi.hoisted(() => {
  const userCreate = vi.fn(async ({ data }: any) => ({
    id: `user-${data.email}`,
    email: data.email,
    name: data.name,
  }));
  return {
    tenantFindUnique: vi.fn(async () => ({ shortName: "Apex Bank" })),
    sendInvitationEmail: vi.fn(async (_params: unknown) => undefined),
    bcryptHash: vi.fn(async (raw: string) => `bcrypt:${raw}`),
    userCreate,
    // A fake transaction whose doubles let the onboarding closure run through.
    fakeTx: {
      tenant: { updateMany: vi.fn(async () => ({ count: 1 })) },
      auditArea: { create: vi.fn(async () => ({ id: "area" })) },
      branch: {
        create: vi.fn(async ({ data }: any) => ({
          id: `br-${data.code}`,
          code: data.code,
        })),
        findMany: vi.fn(async () => []),
      },
      complianceRequirement: { create: vi.fn(async () => ({ id: "cr" })) },
      user: { create: userCreate },
      userBranchAssignment: { create: vi.fn(async () => ({ id: "uba" })) },
      auditLog: { create: vi.fn(async () => ({ id: "log" })) },
      onboardingProgress: { delete: vi.fn(async () => ({})) },
    },
  };
});

vi.mock("bcryptjs", () => ({ default: { hash: bcryptHash } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: tenantFindUnique } },
}));
vi.mock("@/lib/invitation-mailer", () => ({ sendInvitationEmail }));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(async (_actor, _action, fn) => fn(fakeTx)),
}));

import { completeOnboardingTransaction } from "@/data-access/onboarding";
import { TENANT_A, USER_A } from "@/test/factories";

function baseData(invitedUsers: any[]) {
  return {
    tenantId: TENANT_A,
    bankRegistration: {
      bankName: "Apex Sahakari Bank",
      shortName: "Apex Bank",
      rbiLicenseNumber: "UCB-1",
      state: "MH",
      city: "Pune",
      registrationNo: "R1",
      registeredWith: "RBI",
      ucbType: "SCHEDULED",
      establishedDate: "2000-01-01",
      pan: "AAAAA0000A",
    },
    tierSelection: {
      tier: "TIER_2",
      multiStateLicense: false,
      pcaStatus: "NONE",
    },
    selectedItems: [],
    departments: [],
    branches: [],
    invitedUsers,
    userId: USER_A,
    sessionId: "sess",
    ipAddress: "10.0.0.1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeOnboardingTransaction — wizard invitee activation", () => {
  it("mints an invite token + expiry for each invited user", async () => {
    await completeOnboardingTransaction(
      baseData([
        {
          name: "Asha",
          email: "asha@ucb.example",
          roles: ["AUDITOR"],
          branchAssignments: [],
        },
        {
          name: "Ravi",
          email: "ravi@ucb.example",
          roles: ["CCO"],
          branchAssignments: [],
        },
      ]) as any,
    );

    expect(userCreate).toHaveBeenCalledTimes(2);
    for (const call of userCreate.mock.calls) {
      const { data } = call[0] as any;
      expect(data.status).toBe("INVITED");
      expect(typeof data.inviteTokenHash).toBe("string");
      expect(data.inviteTokenHash.length).toBeGreaterThan(0);
      expect(data.inviteExpiry).toBeInstanceOf(Date);
      expect(data.inviteExpiry.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("emails every invitee after commit, with the tenant short name", async () => {
    await completeOnboardingTransaction(
      baseData([
        {
          name: "Asha",
          email: "asha@ucb.example",
          roles: ["AUDITOR"],
          branchAssignments: [],
        },
      ]) as any,
    );

    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    const arg = sendInvitationEmail.mock.calls[0][0] as any;
    expect(arg.to).toBe("asha@ucb.example");
    expect(arg.inviteeName).toBe("Asha");
    expect(arg.bankName).toBe("Apex Bank");
    expect(typeof arg.rawToken).toBe("string");
    expect(arg.rawToken.length).toBeGreaterThan(0);
    expect(arg.expiresAt).toBeInstanceOf(Date);
  });

  it("sends no email when there are no invitees", async () => {
    await completeOnboardingTransaction(baseData([]) as any);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});
