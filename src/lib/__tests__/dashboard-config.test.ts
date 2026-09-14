import { describe, it, expect } from "vitest";
import {
  allowedDashboardWidgetIds,
  getDashboardConfig,
} from "@/lib/dashboard-config";

describe("allowedDashboardWidgetIds", () => {
  it("drops CAE widgets requested by an AUDITOR", () => {
    expect(
      allowedDashboardWidgetIds(
        ["AUDITOR"],
        ["health-score", "my-observations", "branch-heatmap"],
      ),
    ).toEqual(["my-observations"]);
  });

  it("returns nothing for FIELD_AUDITOR even though they have dashboard:auditor", () => {
    expect(
      allowedDashboardWidgetIds(["FIELD_AUDITOR"], ["health-score"]),
    ).toEqual([]);
  });

  it("returns nothing for AUDITEE", () => {
    expect(
      allowedDashboardWidgetIds(
        ["AUDITEE"],
        ["health-score", "severity-distribution"],
      ),
    ).toEqual([]);
  });

  it("keeps widgets that belong to the caller's role", () => {
    const allowed = new Set(getDashboardConfig(["CAE"]).map((w) => w.id));
    const requested = ["health-score", "bogus-widget", "branch-heatmap"];
    const result = allowedDashboardWidgetIds(["CAE"], requested);
    expect(result.every((id) => allowed.has(id))).toBe(true);
    expect(result).toEqual(["health-score", "branch-heatmap"]);
  });
});
