import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

interface SubsystemCheck {
  status: "ok" | "error" | "warning" | "unavailable";
  responseTimeMs?: number;
  [key: string]: unknown;
}

async function checkDatabase(): Promise<SubsystemCheck> {
  const start = performance.now();
  try {
    await getPool().query("SELECT 1");
    return {
      status: "ok",
      responseTimeMs: Math.round(performance.now() - start),
    };
  } catch {
    return {
      status: "error",
      responseTimeMs: Math.round(performance.now() - start),
    };
  }
}

async function checkJobQueue(dbHealthy: boolean): Promise<SubsystemCheck> {
  if (!dbHealthy) {
    return { status: "unavailable" };
  }
  const start = performance.now();
  try {
    const result = await getPool().query(
      `SELECT count(*)::int as active FROM pgboss.job WHERE state IN ('active', 'created')`,
    );
    return {
      status: "ok",
      responseTimeMs: Math.round(performance.now() - start),
      activeJobs: result.rows[0]?.active ?? 0,
    };
  } catch {
    // pgboss schema may not exist yet (first run before migrations)
    return {
      status: "unavailable",
      responseTimeMs: Math.round(performance.now() - start),
    };
  }
}

function checkMemory(): SubsystemCheck {
  const mem = process.memoryUsage();
  const v8 = require("v8").getHeapStatistics();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapLimitMB = Math.round(v8.heap_size_limit / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  // Compare against V8 heap size limit (--max-old-space-size), not current allocation
  const usagePercent =
    Math.round((mem.heapUsed / v8.heap_size_limit) * 1000) / 10;

  return {
    status: usagePercent >= 85 ? "warning" : "ok",
    heapUsedMB,
    heapTotalMB,
    heapLimitMB,
    usagePercent,
  };
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  const [database, memory] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkMemory()),
  ]);

  const jobQueue = await checkJobQueue(database.status === "ok");

  // Overall status: error if database down, degraded if non-critical issues, ok otherwise
  let status: "ok" | "degraded" | "error" = "ok";
  if (database.status === "error") {
    status = "error";
  } else if (memory.status === "warning" || jobQueue.status === "unavailable") {
    status = "degraded";
  }

  const health = {
    status,
    timestamp: new Date().toISOString(),
    requestId,
    checks: {
      database,
      jobQueue,
      memory,
    },
    version: "4.0.0",
  };

  if (status === "error") {
    logger.error({ health }, "health check failed");
  } else if (status === "degraded") {
    logger.warn({ health }, "health check degraded");
  } else {
    logger.info({ status, db: database.responseTimeMs }, "health check");
  }

  const statusCode = status === "error" ? 503 : 200;
  return NextResponse.json(health, { status: statusCode });
}
