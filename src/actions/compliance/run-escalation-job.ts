"use server";

/**
 * Compliance Escalation Job (Phase 2 — R39)
 *
 * Full escalation pipeline: compute levels → route notifications → create queue entries.
 * Triggered manually through runEscalationJob (session-scoped), and per tenant
 * by the scheduled compliance-escalation job in src/jobs/.
 */

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { runEscalationJobInternal } from "@/jobs/run-escalation-for-tenant";

/**
 * Run escalation job (session-based, for manual trigger).
 * Requires CAE/AUDIT_MANAGER permission.
 *
 * The tenant-scoped worker lives in src/jobs/run-escalation-for-tenant.ts,
 * not in this file. Next.js treats every export of a `"use server"` module
 * as a public action; exporting a function that takes tenantId would let any
 * signed-in user run escalation against any bank.
 */
export async function runEscalationJob() {
  const session = await getRequiredSession();

  if (!hasPermission(session.user.roles, "escalation:compute")) {
    throw new Error("Unauthorized: escalation:compute permission required");
  }

  const tenantId = session.user.tenantId;

  return runEscalationJobInternal(tenantId);
}
