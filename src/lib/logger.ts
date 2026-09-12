import pino from "pino";

// Known exception: reads NODE_ENV directly to avoid circular dep with env.ts
const isDevelopment = (process.env.NODE_ENV ?? "development") === "development";

/**
 * Structured logger singleton using pino.
 *
 * Features:
 * - Production: JSON logs to stdout (for CloudWatch/log aggregation)
 * - Development: Colorized, human-readable logs via pino-pretty
 * - Automatic redaction of sensitive fields (password, token, authorization, cookie)
 * - Base metadata: { service: "aegis" }
 * - ISO 8601 timestamps
 * - Severity level formatting for CloudWatch Logs Insights
 *
 * Usage:
 * ```typescript
 * import { logger, createRequestLogger } from "@/lib/logger";
 *
 * // Basic logging
 * logger.info({ userId: "123" }, "user logged in");
 *
 * // Request-scoped child logger
 * const reqLogger = createRequestLogger({
 *   userId: session.user.id,
 *   tenantId: session.user.tenantId,
 *   requestId: "req-123",
 *   method: "POST",
 *   path: "/api/findings"
 * });
 * reqLogger.info({ findingId }, "finding created");
 * ```
 */
export const logger = pino({
  level: isDevelopment ? "debug" : "info",

  // Base metadata for all logs
  base: {
    service: "aegis",
  },

  // ISO 8601 timestamps
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format severity level for CloudWatch Logs Insights
  formatters: {
    level: (label) => {
      return { severity: label.toUpperCase() };
    },
  },

  // Serialize Error objects so pino captures message and stack instead of {}.
  // Pino's built-in error serializer handles both `err` (pino convention) and
  // `error` (common call-site key used throughout this codebase).
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },

  // Redact sensitive fields automatically
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "req.headers.authorization",
      "cookie",
      "*.cookie",
      "req.headers.cookie",
      "secret",
      "*.secret",
      "apiKey",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },

  // Development: pretty-print with colors
  // Production: raw JSON to stdout (captured by Docker/CloudWatch)
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

/**
 * Create a child logger with request context.
 *
 * Use this to add metadata like userId, tenantId, requestId to all logs
 * within a request handler (API route or server action).
 *
 * @example
 * ```typescript
 * const reqLogger = createRequestLogger({
 *   userId: session.user.id,
 *   tenantId: session.user.tenantId,
 *   requestId: headers().get("x-request-id") ?? crypto.randomUUID(),
 *   method: "GET",
 *   path: "/api/findings/123"
 * });
 *
 * reqLogger.info("fetching finding");
 * reqLogger.error({ error }, "failed to fetch finding");
 * ```
 */
export function createRequestLogger(context: {
  userId?: string;
  tenantId?: string;
  requestId?: string;
  path?: string;
  method?: string;
}) {
  return logger.child(context);
}
