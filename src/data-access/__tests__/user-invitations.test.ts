import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  mintInviteToken,
  createInvitedUsers,
} from "@/data-access/user-invitations";

describe("mintInviteToken", () => {
  it("returns a raw token whose hash verifies against it", async () => {
    const { rawToken, tokenHash } = await mintInviteToken();
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await bcrypt.compare(rawToken, tokenHash)).toBe(true);
  });

  it("mints a distinct token on every call", async () => {
    const a = await mintInviteToken();
    const b = await mintInviteToken();
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe("createInvitedUsers", () => {
  function fakeTx(branches: { id: string; code: string }[] = []) {
    // No `auditLog` on this fake: createInvitedUsers must rely solely on the
    // trigger, never write one by hand. A stray call would throw here.
    return {
      user: {
        create: vi.fn(async ({ data }: any) => ({
          id: `user-${data.email}`,
          email: data.email,
          name: data.name,
        })),
      },
      branch: {
        findMany: vi.fn(async () => branches),
      },
      userBranchAssignment: {
        create: vi.fn(async () => ({ id: "uba" })),
      },
    };
  }

  it("creates one user per invite with the invited-user shape", async () => {
    const tx = fakeTx();
    const created = await createInvitedUsers(tx as any, {
      tenantId: "tenant-1",
      invitedBy: "admin-1",
      invites: [
        {
          name: "Asha",
          email: "asha@ucb.example",
          roles: ["AUDITOR"],
          tokenHash: "hash-asha",
        },
      ],
    });

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    const { data } = tx.user.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: "asha@ucb.example",
      name: "Asha",
      tenantId: "tenant-1",
      status: "INVITED",
      invitedBy: "admin-1",
      inviteTokenHash: "hash-asha",
    });
    expect(data.inviteExpiry.getTime()).toBeGreaterThan(Date.now());

    expect(created).toEqual([
      {
        id: "user-asha@ucb.example",
        email: "asha@ucb.example",
        name: "Asha",
        inviteExpiry: data.inviteExpiry,
      },
    ]);
  });

  it("assigns branches for an AUDITEE with matching branch codes", async () => {
    const tx = fakeTx([{ id: "branch-1", code: "BR1" }]);
    await createInvitedUsers(tx as any, {
      tenantId: "tenant-1",
      invitedBy: "admin-1",
      invites: [
        {
          name: "Ravi",
          email: "ravi@ucb.example",
          roles: ["AUDITEE"],
          branchAssignments: ["BR1"],
          tokenHash: "hash-ravi",
        },
      ],
    });

    expect(tx.branch.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", code: { in: ["BR1"] } },
    });
    expect(tx.userBranchAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-ravi@ucb.example",
        branchId: "branch-1",
        tenantId: "tenant-1",
      },
    });
  });

  it("skips branch resolution for a non-AUDITEE role", async () => {
    const tx = fakeTx([{ id: "branch-1", code: "BR1" }]);
    await createInvitedUsers(tx as any, {
      tenantId: "tenant-1",
      invitedBy: "admin-1",
      invites: [
        {
          name: "Priya",
          email: "priya@ucb.example",
          roles: ["AUDITOR"],
          branchAssignments: ["BR1"],
          tokenHash: "hash-priya",
        },
      ],
    });

    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAssignment.create).not.toHaveBeenCalled();
  });
});
