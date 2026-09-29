import { prismaSystem } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Daily ComplianceItem escalation (R39) across every tenant.
 *
 * This pipeline previously had no scheduled trigger at all. Its only automated
 * trigger was POST /api/cron/escalation, which middleware blocked because it
 * requires a session cookie before any route-level Bearer check; the pipeline
 * was otherwise reachable only through runEscalationJob, the permission-gated
 * manual server action. Scheduling it here puts it alongside the other
 * recurring work, with no second auth scheme and no externally reachable
 * endpoint.
 *
 * Distinct from processOverdueEscalation, which escalates Observations.
 *
 * The per-tenant worker is imported from a non-action module on purpose:
 * it takes a tenantId, so it must never be an export of a `"use server"` file.
 */
export async function processComplianceEscalation(): Promise<void> {
  const { runEscalationJobInternal } =
    await import("@/jobs/run-escalation-for-tenant");

  const tenants = await prismaSystem.tenant.findMany({
    select: { id: true, shortName: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      await runEscalationJobInternal(tenant.id);
      succeeded++;
    } catch (error) {
      failed++;
      logger.error(
        {
          action: "compliance_escalation_tenant_failed",
          tenantId: tenant.id,
          name: tenant.shortName,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        "Compliance escalation failed for tenant",
      );
    }
  }

  logger.info(
    {
      action: "compliance_escalation_complete",
      tenants: tenants.length,
      succeeded,
      failed,
    },
    "Compliance escalation completed",
  );
}
