/**
 * Next.js instrumentation hook.
 *
 * Runs once on server start. Initializes:
 * - Sentry error tracking (server/edge runtimes)
 * - pg-boss job queue and scheduled workers
 * - Signal handlers that stop those workers before the process exits
 */

/** Module-level so dev-server hot reloads do not stack handlers. */
let shutdownRegistered = false;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Checked before startWorkers() so a hard-fail here doesn't leave
    // pg-boss workers running with no server to serve requests.
    if (process.env.LICENSE_FILE_PATH) {
      const { loadLicense } = await import("./lib/license");
      const host = process.env.NEXT_PUBLIC_APP_URL
        ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
        : "localhost";
      const result = loadLicense(host);
      if (result.status === "invalid") {
        throw new Error(
          `License check failed (${result.reason}). Refusing to start.`,
        );
      }
      if (result.status === "grace") {
        console.warn(
          `[license] Running in the grace period, ${result.daysRemaining} day(s) remaining. Renew before it ends.`,
        );
      }
    }

    const { startWorkers, stopWorkers } = await import("./lib/job-queue");
    await startWorkers();

    if (!shutdownRegistered) {
      shutdownRegistered = true;

      // Coolify stops a container with SIGTERM. Without this, in-flight jobs
      // are killed mid-transaction and pg-boss re-delivers work whose side
      // effects already happened.
      const shutdown = async (signal: NodeJS.Signals) => {
        try {
          await stopWorkers();
        } catch {
          // Nothing useful to do at this point; the process is going away.
        } finally {
          process.exit(signal === "SIGTERM" ? 0 : 130);
        }
      };

      process.once("SIGTERM", () => void shutdown("SIGTERM"));
      process.once("SIGINT", () => void shutdown("SIGINT"));
    }
  }
}
