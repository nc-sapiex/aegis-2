/**
 * GET /api/loan-portfolio/template?moduleCode=HOUSING_LOANS
 *
 * Returns a downloadable Excel template for the specified loan module.
 * The template includes per-module column headers and example rows.
 *
 * Permission: rbia:examine (HIA role required)
 */

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { generateLoanTemplate } from "@/lib/loan-portfolio/template-generator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // ── Auth & permission check ────────────────────────────────────────────
    const session = await getRequiredSession();
    const userRoles = session.user.roles;

    if (!hasPermission(userRoles, "rbia:examine")) {
      return new Response("Forbidden", { status: 403 });
    }

    // ── Read moduleCode from query params ─────────────────────────────────
    const url = new URL(request.url);
    const moduleCode = url.searchParams.get("moduleCode") ?? "HOUSING_LOANS";

    // ── Generate template ─────────────────────────────────────────────────
    const buffer = await generateLoanTemplate(moduleCode);

    const filename = `loan-portfolio-template-${moduleCode.toLowerCase()}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate template";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
