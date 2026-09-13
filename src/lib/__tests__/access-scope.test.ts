import { describe, it, expect } from "vitest";
import {
  hasDashboardAccess,
  postLoginHome,
  isBranchScopedObservationReader,
} from "@/lib/access-scope";

describe("hasDashboardAccess", () => {
  it("admits RISK_HEAD via dashboard:risk_head", () => {
    expect(hasDashboardAccess(["RISK_HEAD"])).toBe(true);
  });

  it("rejects AUDITEE and BRANCH_HEAD", () => {
    expect(hasDashboardAccess(["AUDITEE"])).toBe(false);
    expect(hasDashboardAccess(["BRANCH_HEAD"])).toBe(false);
  });
});

describe("postLoginHome", () => {
  it("sends AUDITEE and BRANCH_HEAD to the auditee portal, not /dashboard", () => {
    expect(postLoginHome(["AUDITEE"])).toBe("/auditee");
    expect(postLoginHome(["BRANCH_HEAD"])).toBe("/auditee");
  });

  it("keeps CAE and RISK_HEAD on /dashboard", () => {
    expect(postLoginHome(["CAE"])).toBe("/dashboard");
    expect(postLoginHome(["RISK_HEAD"])).toBe("/dashboard");
  });
});

describe("isBranchScopedObservationReader", () => {
  it("scopes a lone AUDITEE or BRANCH_HEAD", () => {
    expect(isBranchScopedObservationReader(["AUDITEE"])).toBe(true);
    expect(isBranchScopedObservationReader(["BRANCH_HEAD"])).toBe(true);
  });

  it("does not scope CAE or an AUDITEE who also holds CAE", () => {
    expect(isBranchScopedObservationReader(["CAE"])).toBe(false);
    expect(isBranchScopedObservationReader(["AUDITEE", "CAE"])).toBe(false);
  });
});
