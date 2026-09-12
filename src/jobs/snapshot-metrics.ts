import "server-only";
import { prisma, prismaForTenant } from "@/lib/prisma";
import {
  getHealthScore,
  getComplianceSummary,
  getObservationSeverity,
} from "@/data-access/dashboard";

/**
 * Daily snapshot capture job.
 * Runs at 01:00 IST (19:30 UTC) via pg-boss cron.
 * Captures health score, compliance summary, and severity breakdown
 * for each onboarded tenant into the DashboardSnapshot table.
 */
export async function captureMetricsSnapshot(): Promise<void> {
  console.log("[snapshot-metrics] Starting daily capture");

  const tenants = await prisma.tenant.findMany({
    where: { onboardingCompleted: true },
    select: { id: true, name: true },
  });

  console.log(`[snapshot-metrics] Found ${tenants.length} tenants`);

  // Process tenants in batches of 10 to avoid connection pool exhaustion
  const BATCH_SIZE = 10;
  let captured = 0;

  for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
    const batch = tenants.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (tenant: { id: string; name: string }) => {
        try {
          const db = prismaForTenant(tenant.id);
          const [health, compliance, severity] = await Promise.all([
            getHealthScore(db, tenant.id),
            getComplianceSummary(db, tenant.id),
            getObservationSeverity(db, tenant.id),
          ]);

          await db.dashboardSnapshot.create({
            data: {
              tenantId: tenant.id,
              metrics: {
                healthScore: health.score,
                compliance: {
                  total: compliance.total,
                  compliant: compliance.compliant,
                  partial: compliance.partial,
                  nonCompliant: compliance.nonCompliant,
                  pending: compliance.pending,
                  percentage: compliance.percentage,
                },
                severity: {
                  total: severity.total,
                  totalOpen: severity.totalOpen,
                  criticalOpen: severity.criticalOpen,
                  highOpen: severity.highOpen,
                  mediumOpen: severity.mediumOpen,
                  lowOpen: severity.lowOpen,
                  closed: severity.closed,
                },
              },
            },
          });
          captured++;
          console.log(`[snapshot-metrics] Captured for ${tenant.name}`);
        } catch (error) {
          console.error(`[snapshot-metrics] Failed for ${tenant.name}:`, error);
          // Continue with next tenant — don't fail entire batch
        }
      }),
    );
  }

  console.log(
    `[snapshot-metrics] Daily capture complete: ${captured}/${tenants.length} tenants`,
  );
}
