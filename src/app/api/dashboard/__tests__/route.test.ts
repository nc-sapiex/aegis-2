/**
 * Authorization regression gate for GET /api/dashboard.
 *
 * The page only fetches widgets from getDashboardConfig(roles). The API used
 * to take `?widgets=` verbatim, so FIELD_AUDITOR / AUDITOR could pull
 * CAE-level aggregates (health-score, branch-heatmap) with a crafted URL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/dashboard", () => ({ getDashboardData: vi.fn() }));

import { GET } from "../route";
import { getRequiredSession } from "@/data-access/session";
import { getDashboardData } from "@/data-access/dashboard";
import { fakeSession } from "@/test/factories";

function request(widgets: string) {
  const url = new URL("http://localhost:3000/api/dashboard");
  url.searchParams.set("widgets", widgets);
  return new NextRequest(url);
}

describe("GET /api/dashboard — widget allowlist at the route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDashboardData).mockResolvedValue({
      healthScore: { score: 99 },
    } as never);
  });

  it("refuses AUDITEE before fetching any widget data", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITEE"] }) as never,
    );

    const res = await GET(request("health-score,branch-heatmap"));

    expect(res.status).toBe(403);
    expect(getDashboardData).not.toHaveBeenCalled();
  });

  it("does not fetch CAE widgets for an AUDITOR crafted query", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );
    vi.mocked(getDashboardData).mockResolvedValue({} as never);

    const res = await GET(
      request("health-score,my-observations,branch-heatmap"),
    );

    expect(res.status).toBe(200);
    expect(getDashboardData).toHaveBeenCalledTimes(1);
    const requested = vi.mocked(getDashboardData).mock.calls[0][1];
    expect(requested).toEqual(["my-observations"]);
    expect(requested).not.toContain("health-score");
    expect(requested).not.toContain("branch-heatmap");
  });

  it("returns empty data for FIELD_AUDITOR requesting CAE widgets", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["FIELD_AUDITOR"] }) as never,
    );

    const res = await GET(request("health-score"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(getDashboardData).not.toHaveBeenCalled();
  });
});

describe("GET /api/dashboard source invariant", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/dashboard/route.ts"),
    "utf-8",
  );

  it("intersects requested widgets with the role allowlist", () => {
    expect(source).toContain("allowedDashboardWidgetIds");
    expect(source).toContain("hasDashboardAccess");
  });
});
