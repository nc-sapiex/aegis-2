import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.1" })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn() } },
  prismaForTenant: vi.fn(),
}));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn(),
}));
vi.mock("@/lib/invitation-mailer", () => ({ sendInvitationEmail: vi.fn() }));
vi.mock("@/data-access/user-invitations", () => ({
  mintInviteToken: vi.fn(async () => ({
    rawToken: "raw-token",
    tokenHash: "hashed",
  })),
  createInvitedUsers: vi.fn(),
}));

import { revokeInvitation, resendInvitation } from "../user-invitations";
import { prismaForTenant } from "@/lib/prisma";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { TENANT_A, USER_A, fakeDb, fakeSession } from "@/test/factories";

const INVITED = {
  id: USER_A,
  email: "asha@ucb.example",
  name: "Asha",
  tenantId: TENANT_A,
  status: "INVITED",
};

describe("revokeInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
  });

  it("deletes only while the user is still INVITED", async () => {
    const tx = fakeDb({
      user: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    });
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _a: unknown,
      _b: unknown,
      fn: (t: unknown) => unknown,
    ) => fn(tx)) as never);
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({ user: { findFirst: vi.fn(async () => INVITED) } }),
    );

    const result = await revokeInvitation(USER_A);

    expect(result).toEqual({ success: true, error: null });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { id: USER_A, tenantId: TENANT_A, status: "INVITED" },
    });
  });

  it("does not delete a user who activated between the read and the write", async () => {
    const tx = fakeDb({
      user: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    });
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _a: unknown,
      _b: unknown,
      fn: (t: unknown) => unknown,
    ) => fn(tx)) as never);
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({ user: { findFirst: vi.fn(async () => INVITED) } }),
    );

    const result = await revokeInvitation(USER_A);

    expect(result).toEqual({
      success: false,
      error: "User not found or already active.",
    });
  });
});

describe("resendInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
  });

  it("does not stamp a new token onto a user who is no longer INVITED", async () => {
    const tx = fakeDb({
      user: { updateMany: vi.fn(async () => ({ count: 0 })) },
    });
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _a: unknown,
      _b: unknown,
      fn: (t: unknown) => unknown,
    ) => fn(tx)) as never);
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        user: { findFirst: vi.fn(async () => INVITED) },
        tenant: { findUnique: vi.fn() },
      }),
    );

    const result = await resendInvitation(USER_A);

    expect(result).toEqual({
      success: false,
      error: "User not found or already active.",
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: USER_A, tenantId: TENANT_A, status: "INVITED" },
      data: expect.objectContaining({
        inviteTokenHash: "hashed",
      }),
    });
  });
});
