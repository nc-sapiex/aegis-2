import { describe, it, expect } from "vitest";
import { inviteUserSchema } from "@/lib/validations/users";

// Guards the admin "Invite user" form contract (src/components/admin/
// invite-user-dialog.tsx) — the shape sendUserInvitations consumes.

describe("inviteUserSchema", () => {
  const valid = {
    name: "Asha Rao",
    email: "asha@bank.example",
    roles: ["AUDITOR"],
    branchAssignments: ["BR001"],
  };

  it("accepts a well-formed invite", () => {
    const parsed = inviteUserSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("trims the name and email", () => {
    const parsed = inviteUserSchema.parse({
      ...valid,
      name: "  Asha Rao  ",
      email: "  asha@bank.example  ",
    });
    expect(parsed.name).toBe("Asha Rao");
    expect(parsed.email).toBe("asha@bank.example");
  });

  it("rejects an empty name", () => {
    expect(inviteUserSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    expect(
      inviteUserSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("requires at least one role", () => {
    expect(inviteUserSchema.safeParse({ ...valid, roles: [] }).success).toBe(
      false,
    );
  });

  it("rejects a role outside the assignable set", () => {
    expect(
      inviteUserSchema.safeParse({ ...valid, roles: ["BOARD_OBSERVER"] })
        .success,
    ).toBe(false);
  });

  it("allows omitting branch assignments", () => {
    const { branchAssignments: _omit, ...withoutBranches } = valid;
    expect(inviteUserSchema.safeParse(withoutBranches).success).toBe(true);
  });
});
