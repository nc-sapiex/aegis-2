import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Environment Variable Validation
 *
 * Centralized Zod schema for all environment variables with build-time validation.
 * Validation runs when next.config.ts imports this file.
 *
 * Usage: import { env } from "@/env"
 * Access: env.DATABASE_URL (type-safe with IDE autocomplete)
 *
 * Docker builds: Set SKIP_ENV_VALIDATION=1 to bypass validation when secrets unavailable
 */
export const env = createEnv({
  /**
   * Server-side environment variables (not exposed to client)
   * Access these ONLY in server components, API routes, or server actions
   */
  server: {
    // Database (PostgreSQL 16)
    DATABASE_URL: z.string().url(),
    // Owner connection for migrations, bootstrap, verify, seed. Scripts only.
    DATABASE_OWNER_URL: z.string().url().optional(),
    DATABASE_APP_PASSWORD: z.string().min(16).optional(),
    // aegis_system: BYPASSRLS, same table grants as aegis_app. Only for the
    // narrow cross-tenant/pre-auth reads that cannot carry a tenant GUC
    // (job tenant enumeration, invite-token lookup). See src/lib/prisma.ts.
    DATABASE_SYSTEM_URL: z.string().url().optional(),
    DATABASE_SYSTEM_PASSWORD: z.string().min(16).optional(),
    // Individual Postgres vars are used by docker-compose for the DB container.
    // The app only needs DATABASE_URL, so these are optional here.
    POSTGRES_USER: z.string().min(1).optional(),
    POSTGRES_PASSWORD: z.string().min(1).optional(),
    POSTGRES_DB: z.string().min(1).optional(),
    POSTGRES_PORT: z.coerce.number().int().positive().optional(),

    // Authentication (Better Auth)
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),

    // AWS S3 Evidence Storage (Mumbai region for RBI data localization)
    // Optional — features requiring S3 degrade gracefully when not configured
    AWS_REGION: z.string().min(1).optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_BUCKET_NAME: z.string().min(1).optional(),
    STORAGE_DRIVER: z.enum(["s3", "minio", "disabled"]).default("s3"),
    S3_ENDPOINT: z.string().url().optional(), // required when STORAGE_DRIVER=minio

    // AWS SES Email (Mumbai region for RBI data localization)
    // Optional in development - required in production for email notifications
    AWS_SES_REGION: z.string().min(1).optional(),
    SES_FROM_EMAIL: z.string().email().optional(),
    MAIL_DRIVER: z.enum(["ses", "smtp", "disabled"]).default("ses"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),

    // License file (adapters/licensing plan) — optional; unset means no
    // license check at boot (the SaaS/no-license-file case).
    LICENSE_FILE_PATH: z.string().min(1).optional(),
    LICENSE_PUBLIC_KEY: z.string().min(1).optional(),

    // Application
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Client-side environment variables (exposed to browser)
   * MUST have NEXT_PUBLIC_ prefix
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  /**
   * Runtime environment mapping
   * CRITICAL: Next.js bundler requires explicit destructuring
   * Every key in server/client schemas MUST have a matching entry here
   */
  runtimeEnv: {
    // Server vars
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_OWNER_URL: process.env.DATABASE_OWNER_URL,
    DATABASE_APP_PASSWORD: process.env.DATABASE_APP_PASSWORD,
    DATABASE_SYSTEM_URL: process.env.DATABASE_SYSTEM_URL,
    DATABASE_SYSTEM_PASSWORD: process.env.DATABASE_SYSTEM_PASSWORD,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_DB: process.env.POSTGRES_DB,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    AWS_SES_REGION: process.env.AWS_SES_REGION,
    SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
    MAIL_DRIVER: process.env.MAIL_DRIVER,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    LICENSE_FILE_PATH: process.env.LICENSE_FILE_PATH,
    LICENSE_PUBLIC_KEY: process.env.LICENSE_PUBLIC_KEY,
    NODE_ENV: process.env.NODE_ENV,

    // Client vars
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation when SKIP_ENV_VALIDATION=1
   * Use for Docker builds where secrets aren't available at build time
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined (catches common misconfiguration)
   * Empty string in .env file → treated as missing variable
   */
  emptyStringAsUndefined: true,
});
