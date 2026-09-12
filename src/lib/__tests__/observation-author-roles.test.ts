import { describe, it, expect } from "vitest";
import { Role, hasPermission } from "@/lib/permissions";
import {
  getAvailableTransitions,
  OBSERVATION_AUTHOR_ROLES,
} from "@/lib/state-machine";

/**
 * "New Observation dead-end" regression guard.
 *
 * Any role that can create an observation (holds `observation:create`) must
 * also be able to move it out of DRAFT via "Submit for Review". Otherwise that
 * role's freshly-created drafts strand on a detail page whose "Next Steps" tells
 * the user to submit for review while `ObservationActions` renders no button —
 * a workflow dead-end.
 *
 * This binds src/lib/permissions.ts to src/lib/state-machine.ts: granting a new
 * role `observation:create` without opening DRAFT → SUBMITTED to it fails here.
 */

const SUBMIT: { to: "SUBMITTED"; label: "Submit for Review" } = {
  to: "SUBMITTED",
  label: "Submit for Review",
};

// Every role in the enum that can author an observation.
const authorRoles = Object.values(Role).filter((role) =>
  hasPermission([role], "observation:create"),
);

describe("observation authors can submit their own drafts", () => {
  it("at least one role can author observations", () => {
    expect(authorRoles.length).toBeGreaterThan(0);
  });

  it.each(authorRoles)(
    "%s (has observation:create) can transition DRAFT → SUBMITTED",
    (role) => {
      expect(getAvailableTransitions("DRAFT", [role])).toContainEqual(SUBMIT);
    },
  );

  it("OBSERVATION_AUTHOR_ROLES matches the roles holding observation:create", () => {
    expect([...OBSERVATION_AUTHOR_ROLES].sort()).toEqual(
      [...authorRoles].sort(),
    );
  });

  it("a non-author role (AUDIT_MANAGER) still cannot submit a draft", () => {
    expect(hasPermission([Role.AUDIT_MANAGER], "observation:create")).toBe(
      false,
    );
    expect(
      getAvailableTransitions("DRAFT", [Role.AUDIT_MANAGER]),
    ).not.toContainEqual(SUBMIT);
  });
});
