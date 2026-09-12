import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import {
  createTenant,
  createUser,
  fakeSession,
  integrationPrisma,
  resetDatabase,
} from "../../../tests/integration/harness";

interface CapturedInviteEmail {
  to: string;
  inviteeName: string;
  bankName: string;
  rawToken: string;
  expiresAt: Date;
}

describe("onboarding invitation flow", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("creates an invite token during onboarding and accepts it into a sign-in credential", async () => {
    const tenant = await createTenant("Onboarding Bank");
    const admin = await createUser(tenant.id, ["SYSTEM_ADMIN"]);
    const session = fakeSession({
      id: admin.id,
      tenantId: tenant.id,
      roles: ["SYSTEM_ADMIN"],
    });
    const sentInvites: CapturedInviteEmail[] = [];

    vi.doMock("@/data-access/session", () => ({
      getOnboardingSession: vi.fn(async () => session),
      getRequiredSession: vi.fn(async () => session),
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
      revalidateTag: vi.fn(),
    }));
    vi.doMock("next/headers", () => ({
      headers: vi.fn(
        async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
      ),
    }));
    vi.doMock("@/lib/invitation-mailer", () => ({
      sendInvitationEmail: vi.fn(async (payload: CapturedInviteEmail) => {
        sentInvites.push(payload);
      }),
    }));

    const { completeOnboarding } = await import("../onboarding");

    const onboarding = await completeOnboarding({
      bankRegistration: {
        bankName: "Onboarding Bank",
        shortName: "OBANK",
        rbiLicenseNumber: "UCB-MH-2020-1234",
        state: "Maharashtra",
        city: "Mumbai",
        registrationNo: "REG-001",
        registeredWith: "RBI",
        ucbType: "NON_SCHEDULED",
        establishedDate: "2020-01-01",
        pan: "ABCDE1234F",
        cin: "",
      },
      tierSelection: {
        tier: "TIER_1",
        multiStateLicense: false,
        pcaStatus: "NONE",
      },
      selectedDirections: [],
      departments: [],
      branches: [],
      invitedUsers: [
        {
          name: "Invited Auditor",
          email: "invitee@example.test",
          roles: ["AUDITOR"],
          branchAssignments: [],
        },
      ],
    });

    expect(onboarding.success).toBe(true);
    expect(sentInvites).toHaveLength(1);

    const invite = sentInvites[0];
    const invitedBeforeAccept = await integrationPrisma.user.findUniqueOrThrow({
      where: { email: invite.to },
      select: { status: true, inviteTokenHash: true, inviteExpiry: true },
    });

    expect(invitedBeforeAccept.status).toBe("INVITED");
    expect(invitedBeforeAccept.inviteTokenHash).toBeTruthy();
    expect(invitedBeforeAccept.inviteExpiry).not.toBeNull();

    const { acceptInvitation } = await import("../user-invitations");
    const password = "Branch2026audit";
    const accepted = await acceptInvitation(
      invite.rawToken,
      invite.to,
      password,
    );

    expect(accepted).toEqual({ success: true, error: null });

    const activated = await integrationPrisma.user.findUniqueOrThrow({
      where: { email: invite.to },
      select: {
        id: true,
        status: true,
        inviteTokenHash: true,
        inviteExpiry: true,
        emailVerified: true,
      },
    });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.inviteTokenHash).toBeNull();
    expect(activated.inviteExpiry).toBeNull();
    expect(activated.emailVerified).toBe(true);

    const credential = await integrationPrisma.account.findFirstOrThrow({
      where: { userId: activated.id, providerId: "credential" },
      select: { password: true },
    });
    expect(await verifyPassword({ hash: credential.password!, password })).toBe(
      true,
    );
  });
});
