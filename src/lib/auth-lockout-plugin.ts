import { type BetterAuthPlugin, APIError } from "better-auth";
import { prisma } from "@/lib/prisma";

/**
 * Account Lockout Plugin Configuration
 *
 * Implements account lockout after repeated failed login attempts
 * to prevent brute-force attacks on user accounts.
 */
export interface AccountLockoutConfig {
  /** Maximum failed attempts before lockout (default: 5) */
  maxAttempts: number;
  /** Lockout duration in seconds (default: 1800 = 30 minutes) */
  lockoutDuration: number;
  /** Observation window for counting attempts in seconds (default: 900 = 15 minutes) */
  observationWindow: number;
}

const defaultConfig: AccountLockoutConfig = {
  maxAttempts: 5,
  lockoutDuration: 1800, // 30 minutes
  observationWindow: 900, // 15 minutes
};

/**
 * Better Auth hook context shape at runtime.
 * The published types are narrower than the actual runtime object,
 * so we define an internal interface for type-safe access.
 */
interface HookContext {
  path?: string;
  body?: Record<string, unknown>;
  headers?: Headers;
  context?: {
    newSession?: unknown;
    returned?: unknown;
  };
}

/**
 * Extract client IP from request headers
 */
function getClientIp(headers?: Headers): string {
  if (!headers) return "unknown";
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Account Lockout Plugin for Better Auth
 *
 * Features:
 * - Checks for account lockout before sign-in (before hook)
 * - Tracks failed login attempts and applies lockout (after hook)
 * - Clears failed attempts on successful login
 * - Logs lockout events to AuditLog for security monitoring
 *
 * @example
 * ```typescript
 * import { accountLockout } from "@/lib/auth-lockout-plugin";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     accountLockout({
 *       maxAttempts: 5,
 *       lockoutDuration: 1800,
 *       observationWindow: 900,
 *     }),
 *   ],
 * });
 * ```
 */
export const accountLockout = (
  config?: Partial<AccountLockoutConfig>,
): BetterAuthPlugin => {
  const settings = { ...defaultConfig, ...config };

  return {
    id: "account-lockout",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: async (ctx) => {
            const hookCtx = ctx as unknown as HookContext;
            const email = (hookCtx.body?.email as string)?.toLowerCase();

            if (!email) {
              return;
            }

            // Check if account is currently locked
            const now = new Date();
            const lockout = await prisma.failedLoginAttempt.findFirst({
              where: {
                email,
                lockedUntil: {
                  gt: now,
                },
              },
              orderBy: {
                lockedUntil: "desc",
              },
            });

            if (lockout) {
              throw new APIError("LOCKED", {
                message:
                  "Account temporarily locked due to multiple failed login attempts. Please try again later.",
                metadata: {
                  lockedUntil: lockout.lockedUntil,
                },
              });
            }

            return;
          },
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: async (ctx) => {
            const hookCtx = ctx as unknown as HookContext;
            const email = (hookCtx.body?.email as string)?.toLowerCase();
            const noOp = { response: undefined, headers: undefined };

            if (!email) return noOp;

            const ip = getClientIp(hookCtx.headers);
            const now = new Date();
            const windowStart = new Date(
              now.getTime() - settings.observationWindow * 1000,
            );

            // Check if login succeeded (newSession exists on successful auth)
            if (hookCtx.context?.newSession) {
              // Login succeeded — clear failed attempts for this email
              await prisma.failedLoginAttempt.deleteMany({
                where: {
                  email,
                  lockedUntil: null, // Only clear non-lockout records
                },
              });
              return noOp;
            }

            // Check if response was an error (login failed)
            const returned = hookCtx.context?.returned;
            const isFailure = returned instanceof APIError;

            if (!isFailure) return noOp;

            // Record failed attempt
            await prisma.failedLoginAttempt.create({
              data: {
                email,
                ipAddress: ip,
                attemptedAt: now,
              },
            });

            // Count recent failures within observation window
            const recentFailures = await prisma.failedLoginAttempt.count({
              where: {
                email,
                attemptedAt: { gte: windowStart },
                lockedUntil: null, // Don't count previous lockout records
              },
            });

            // Lock account if threshold exceeded
            if (recentFailures >= settings.maxAttempts) {
              const lockUntil = new Date(
                now.getTime() + settings.lockoutDuration * 1000,
              );

              // Mark all recent attempts with the lockout timestamp
              await prisma.failedLoginAttempt.updateMany({
                where: {
                  email,
                  attemptedAt: { gte: windowStart },
                  lockedUntil: null,
                },
                data: {
                  lockedUntil: lockUntil,
                },
              });

              // Log lockout event to AuditLog for security monitoring
              await prisma.auditLog.create({
                data: {
                  tenantId: "00000000-0000-0000-0000-000000000000", // System event
                  tableName: "User",
                  recordId: email,
                  operation: "LOCKOUT",
                  actionType: "account.locked",
                  oldData: { recentFailures },
                  newData: { lockedUntil: lockUntil.toISOString() },
                  ipAddress: ip,
                  retentionExpiresAt: new Date(
                    now.getTime() + 10 * 365.25 * 24 * 60 * 60 * 1000,
                  ), // 10 years PMLA
                },
              });
            }

            return noOp;
          },
        },
      ],
    },
  };
};
