import { NextRequest, NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { getDashboardData } from "@/data-access/dashboard";
import { hasDashboardAccess } from "@/lib/access-scope";
import { allowedDashboardWidgetIds } from "@/lib/dashboard-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession();
    if (!hasDashboardAccess(session.user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const widgetsParam = request.nextUrl.searchParams.get("widgets") ?? "";
    const requested = widgetsParam
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    const widgetIds = allowedDashboardWidgetIds(session.user.roles, requested);

    if (widgetIds.length === 0) {
      return NextResponse.json({});
    }

    const data = await getDashboardData(session, widgetIds);
    return NextResponse.json(data);
  } catch (error: any) {
    if (error?.digest?.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
