import { NextRequest, NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { getDashboardData } from "@/data-access/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession();

    const widgetsParam = request.nextUrl.searchParams.get("widgets") ?? "";
    const widgetIds = widgetsParam
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);

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
