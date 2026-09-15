import type { PgBoss } from "pg-boss";
import { processNotifications } from "./notification-processor";
import { processDeadlineReminders } from "./deadline-reminder";
import { processOverdueEscalation } from "./overdue-escalation";
import { processRbiaOverdueEscalation } from "./rbia-overdue-escalation";
import { processWeeklyDigest } from "./weekly-digest";
import { captureMetricsSnapshot } from "./snapshot-metrics";
import { processComplianceEscalation } from "./compliance-escalation";
import { verifyAuditChain } from "./verify-audit-chain";
import { processGenerateBoardReport } from "./generate-board-report";
import { logger } from "@/lib/logger";

// Job names (duplicated from job-queue.ts to avoid server-only import)
const JOBS = {
  PROCESS_NOTIFICATIONS: "process-notifications",
  SEND_WEEKLY_DIGEST: "send-weekly-digest",
  DEADLINE_CHECK: "deadline-check",
  GENERATE_BOARD_REPORT: "generate-board-report",
  SNAPSHOT_METRICS: "snapshot-metrics",
  COMPLIANCE_ESCALATION: "compliance-escalation",
  VERIFY_AUDIT_CHAIN: "verify-audit-chain",
  VERIFY_AUDIT_CHAIN_FULL: "verify-audit-chain-full",
} as const;

/**
 * Register all job handlers with pg-boss.
 *
 * Called from job-queue.ts startWorkers() to replace placeholder handlers
 * with real processing logic.
 *
 * Cron schedule (all times in UTC, IST = UTC+5:30):
 * - process-notifications: every minute (continuous dequeue)
 * - deadline-check: daily 00:30 UTC = 06:00 IST
 * - send-weekly-digest: Monday 04:30 UTC = 10:00 IST
 *
 * Overdue escalation runs within the deadline-check job
 * (same daily schedule, different processing step).
 */
export async function registerJobs(boss: PgBoss): Promise<void> {
  logger.info({ action: "register_jobs_start" }, "Registering job handlers");

  // Continuous notification processor (every minute)
  await boss.work(JOBS.PROCESS_NOTIFICATIONS, { batchSize: 50 }, async () => {
    await processNotifications();
  });

  // Daily deadline check + overdue escalation (06:00 IST)
  await boss.work(JOBS.DEADLINE_CHECK, async () => {
    await processDeadlineReminders();
    await processOverdueEscalation();
    await processRbiaOverdueEscalation();
  });

  // Weekly digest for CAE/CCO (Monday 10:00 IST)
  await boss.work(JOBS.SEND_WEEKLY_DIGEST, async () => {
    await processWeeklyDigest();
  });

  // Board report generation handler (triggered on demand, not cron)
  await boss.work(JOBS.GENERATE_BOARD_REPORT, async (jobs) => {
    for (const job of jobs) {
      logger.info(
        { action: "board_report_generation_requested", jobId: job.id },
        "Board report generation requested",
      );
      try {
        const result = await processGenerateBoardReport(
          job.data as Parameters<typeof processGenerateBoardReport>[0],
        );
        logger.info(
          {
            action: "board_report_generated",
            jobId: job.id,
            s3Key: result.s3Key,
          },
          "Board report generated",
        );
      } catch (error) {
        logger.error(
          { action: "board_report_generation_error", jobId: job.id, error },
          "Board report generation failed",
        );
        throw error;
      }
    }
  });

  // Daily metrics snapshot for dashboard trends (01:00 IST)
  await boss.work(JOBS.SNAPSHOT_METRICS, async () => {
    await captureMetricsSnapshot();
  });

  // Daily ComplianceItem escalation (06:30 IST), after deadline-check
  await boss.work(JOBS.COMPLIANCE_ESCALATION, async () => {
    await processComplianceEscalation();
  });

  // Nightly audit hash-chain verification (02:00 IST), spec §5
  await boss.work(JOBS.VERIFY_AUDIT_CHAIN, async () => {
    await verifyAuditChain();
  });

  // Weekly whole-chain walk (Sunday 02:30 IST): the nightly run never
  // re-hashes rows behind its checkpoint
  await boss.work(JOBS.VERIFY_AUDIT_CHAIN_FULL, async () => {
    await verifyAuditChain({ full: true });
  });

  logger.info(
    { action: "register_jobs_complete" },
    "All job handlers registered",
  );
}
