import "server-only";
import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";

// ─── pg-boss Singleton ──────────────────────────────────────────────────────

let boss: PgBoss | null = null;
let started = false;

// ─── Job names ──────────────────────────────────────────────────────────────

export const JOB_NAMES = {
  PROCESS_NOTIFICATIONS: "process-notifications",
  SEND_WEEKLY_DIGEST: "send-weekly-digest",
  DEADLINE_CHECK: "deadline-check",
  GENERATE_BOARD_REPORT: "generate-board-report",
  SNAPSHOT_METRICS: "snapshot-metrics",
  COMPLIANCE_ESCALATION: "compliance-escalation",
} as const;

/** Default queue options for notification queues */
export const QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  deleteAfterSeconds: 30 * 24 * 60 * 60, // 30 days
} as const;

/**
 * Get or create the pg-boss instance.
 * Uses the same DATABASE_URL as Prisma (no extra infrastructure).
 */
export function getJobQueue(): PgBoss {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for pg-boss");
    }

    boss = new PgBoss({
      connectionString,
      monitorIntervalSeconds: 300,
    });

    boss.on("error", (error: Error) => {
      logger.error({ error, action: "pg_boss_error" }, "pg-boss error");
    });
  }

  return boss;
}

/**
 * Start pg-boss and register all job handlers.
 * Called from instrumentation.ts on server boot.
 */
export async function startWorkers(): Promise<void> {
  if (started) return;

  const queue = getJobQueue();
  await queue.start();
  started = true;

  logger.info({ action: "pg_boss_started" }, "pg-boss started successfully");

  // Create queues with retry configuration
  await queue.createQueue(JOB_NAMES.PROCESS_NOTIFICATIONS, QUEUE_OPTIONS);
  await queue.createQueue(JOB_NAMES.DEADLINE_CHECK, QUEUE_OPTIONS);
  await queue.createQueue(JOB_NAMES.SEND_WEEKLY_DIGEST, QUEUE_OPTIONS);
  await queue.createQueue(JOB_NAMES.GENERATE_BOARD_REPORT, QUEUE_OPTIONS);
  await queue.createQueue(JOB_NAMES.SNAPSHOT_METRICS, QUEUE_OPTIONS);
  await queue.createQueue(JOB_NAMES.COMPLIANCE_ESCALATION, QUEUE_OPTIONS);

  // Schedule recurring jobs (IST = UTC+5:30, all cron in UTC)
  await queue.schedule(JOB_NAMES.PROCESS_NOTIFICATIONS, "* * * * *"); // every minute
  await queue.schedule(JOB_NAMES.DEADLINE_CHECK, "30 0 * * *"); // daily 00:30 UTC = 06:00 IST
  await queue.schedule(JOB_NAMES.SEND_WEEKLY_DIGEST, "30 4 * * 1"); // Monday 04:30 UTC = 10:00 IST
  await queue.schedule(JOB_NAMES.SNAPSHOT_METRICS, "30 19 * * *"); // daily 19:30 UTC = 01:00 IST
  await queue.schedule(JOB_NAMES.COMPLIANCE_ESCALATION, "0 1 * * *"); // daily 01:00 UTC = 06:30 IST

  // Register real job handlers from src/jobs/
  const { registerJobs } = await import("@/jobs/index");
  await registerJobs(queue);
}

/**
 * Stop pg-boss gracefully.
 * Called during server shutdown.
 */
export async function stopWorkers(): Promise<void> {
  if (!boss || !started) return;

  await boss.stop({ graceful: true, timeout: 30000 });
  started = false;
  boss = null;

  logger.info({ action: "pg_boss_stopped" }, "pg-boss stopped gracefully");
}
