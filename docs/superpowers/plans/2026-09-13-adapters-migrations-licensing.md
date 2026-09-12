# Adapters, Migrations, Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storage and mail become driver-selectable adapters with no silent fallback, the next-intl compatibility shim is inlined and deleted, Better Auth's password reset flow is wired to a real mailer, schema changes move from `prisma db push` to `prisma migrate`, and the app ships as a licensed, feature-flagged Docker image that boots against a signed license file with no phone-home.

**Architecture:** Two small adapter interfaces (`ObjectStore`, `Mailer`) each get an `s3`/`minio` or `ses`/`smtp` implementation plus a `disabled` implementation that throws on first use, selected once at import time by `STORAGE_DRIVER`/`MAIL_DRIVER`. The existing `src/lib/s3.ts` call sites (8 files) are untouched — `s3.ts` becomes a thin facade over the new `ObjectStore`; the 2 mail call sites are repointed directly at the new `Mailer` since there are few enough to touch directly. Licensing is a signed JSON file verified with Node's built-in `crypto` Ed25519 support (no new dependency) at process start via `src/instrumentation.ts`; feature flags read the verified license's `features` array when a license file is configured, or `Tenant.settings.features` otherwise (no license file configured is the SaaS case). Schema changes move to `prisma migrate`, coexisting with the existing `prisma/sql/manifest.ts` bootstrap-file mechanism (triggers, views, generated RLS policies) which continues to run through `db:bootstrap` after every migrate.

**Tech Stack:** Next.js 16, Prisma 7.4, `@aws-sdk/client-s3` (already a dependency, reused for the MinIO driver via a custom endpoint), `@aws-sdk/client-sesv2` (already a dependency), `nodemailer` (new, SMTP driver only), Node's built-in `crypto` module (Ed25519 sign/verify — no new dependency), Better Auth 1.6.22, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §8 (Deployment seams, licensing, operations — all six subsections), the next-intl bullet of §9 (Consolidation and removals), §1/§1a (decisions D3/D6/D7 and repository-strategy note), §11 weeks 6–7.

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- `docs/reference/` is generated; run `pnpm docs:reference` after schema or action changes and commit the output.
- No network call for license verification — the app must boot correctly with no internet access (§8.3). A hard license failure refuses to start; a grace-window failure runs with a banner and no other behavior change.
- `STORAGE_DRIVER`/`MAIL_DRIVER` `disabled` modes fail loudly on first use, never silently. The `aegis-evidence-dev` silent bucket fallback in `src/lib/s3.ts` is removed (§8.1).
- The private Ed25519 signing key never enters this repository or the Docker image; only the public key ships with the app for verification.
- Every PR touching deployment/licensing (§8) gets a human review before merge (§10). Never merge with `--auto`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/storage/object-store.ts` (new) | `ObjectStore` interface (`put`, `presignPut`, `presignGet`, `delete`) with `s3`, `minio`, `disabled` drivers selected by `STORAGE_DRIVER`. |
| `src/lib/s3.ts` (modify) | Becomes a thin facade: existing exported functions (`generateUploadUrl`, `generateDownloadUrl`, `verifyUpload`, `uploadToS3`, `validateFileType`, `generateS3Key`, `generateBmEvidenceS3Key`) delegate to `object-store.ts`. No caller changes needed. |
| `src/lib/storage/__tests__/object-store.test.ts` (new) | Unit tests for driver selection and the `disabled` failure mode. |
| `src/lib/mail/mailer.ts` (new) | `Mailer` interface (`send`) with `ses`, `smtp`, `disabled` drivers selected by `MAIL_DRIVER`. |
| `src/lib/mail/__tests__/mailer.test.ts` (new) | Unit tests for driver selection and the `disabled` failure mode. |
| `src/lib/invitation-mailer.ts` (modify), `src/jobs/notification-processor.ts` (modify) | Repointed from `src/lib/ses-client.ts` to `src/lib/mail/mailer.ts`. |
| `src/lib/ses-client.ts` (delete) | Superseded by `src/lib/mail/mailer.ts`'s `ses` driver. |
| `src/env.ts` (modify) | `STORAGE_DRIVER`, `MAIL_DRIVER`, `SMTP_HOST/PORT/USER/PASSWORD`, `S3_ENDPOINT` (MinIO), `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEY`. |
| `src/lib/strings.ts`, `src/lib/strings.en.json` (delete) | Next-intl compatibility shim inlined into its 6 call sites, then deleted. |
| `src/app/(auth)/login/page.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/signup-form.tsx`, `src/components/layout/top-bar.tsx`, `src/components/layout/app-sidebar.tsx`, `src/components/reports/print-button.tsx` (modify) | `useTranslations`/`getTranslations` calls replaced with plain string literals. |
| `src/lib/auth.ts` (modify) | `emailAndPassword.sendResetPassword` wired to the new `Mailer`. |
| `src/emails/templates/password-reset-email.tsx` (new), `src/emails/render.ts` (modify) | New email template plus registry entry. |
| `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx` (new) | UI pages Better Auth's client needs for the reset flow. |
| `prisma/migrations/` (modify — baseline), `package.json` (modify — `db:migrate` script) | Existing 3 ad-hoc SQL files retired; a real `prisma migrate` baseline captures current schema state. |
| `scripts/db-bootstrap.ts` (modify) | Runs after `db:migrate` instead of after `db:push`; no logic change, comment update only. |
| `src/lib/license.ts` (new) | `LicenseFile` type, `verifyLicense(raw, publicKeyPem)`, `loadLicense()` (reads `LICENSE_FILE_PATH`, verifies, returns grace/hard-fail state). |
| `src/lib/__tests__/license.test.ts` (new) | Unit tests: valid signature, tampered payload, expired, host mismatch, grace window. |
| `src/instrumentation.ts` (modify) | Calls `loadLicense()` at process start; hard-fails or sets a module-level banner flag. |
| `scripts/aegis-license.ts` (new) | CLI: `generate-keypair`, `issue`, `inspect`. |
| `src/lib/feature-flags.ts` (new) | `getFeatureFlags(tenant, license)`: license features when a license is loaded, else `tenant.settings.features`. `core` always included. |
| `src/lib/__tests__/feature-flags.test.ts` (new) | Unit tests for both sources and the always-on `core` flag. |
| `prisma/schema.prisma` (no change) | `Tenant.settings Json?` already exists; feature flags for the SaaS path live in it under a `features` key, no migration needed. |

---

### Task 1: Storage adapter — `ObjectStore` with no silent fallback

**Files:**
- Create: `src/lib/storage/object-store.ts`
- Create: `src/lib/storage/__tests__/object-store.test.ts`
- Modify: `src/lib/s3.ts` (facade only — internals delegate, exports unchanged)
- Modify: `src/env.ts`

**Interfaces:**
- Consumes: `env.STORAGE_DRIVER`, `env.S3_BUCKET_NAME` (now required, no fallback), `env.S3_ENDPOINT` (optional, MinIO).
- Produces: `ObjectStore` type and `getObjectStore(): ObjectStore` used only inside `s3.ts`; no other file imports `object-store.ts` directly in this task (existing 8 callers keep importing `s3.ts`).

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/storage/__tests__/object-store.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: vi.fn() })),
  PutObjectCommand: vi.fn((input) => ({ input })),
  GetObjectCommand: vi.fn((input) => ({ input })),
  DeleteObjectCommand: vi.fn((input) => ({ input })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://presigned.example/put"),
}));

describe("getObjectStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds an s3 driver with a custom endpoint for minio", async () => {
    vi.stubEnv("STORAGE_DRIVER", "minio");
    vi.stubEnv("S3_BUCKET_NAME", "evidence-bucket");
    vi.stubEnv("S3_ENDPOINT", "http://localhost:9000");
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { getObjectStore } = await import("../object-store");
    getObjectStore();
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "http://localhost:9000", forcePathStyle: true }),
    );
    vi.unstubAllEnvs();
  });

  it("the disabled driver throws loudly on first use, not silently", async () => {
    vi.stubEnv("STORAGE_DRIVER", "disabled");
    const { getObjectStore } = await import("../object-store");
    const store = getObjectStore();
    await expect(store.presignPut("k", "application/pdf")).rejects.toThrow(
      /storage is disabled/i,
    );
    vi.unstubAllEnvs();
  });

  it("requires S3_BUCKET_NAME for the s3 driver — no aegis-evidence-dev fallback", async () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET_NAME", "");
    const { getObjectStore } = await import("../object-store");
    expect(() => getObjectStore()).toThrow(/S3_BUCKET_NAME is required/);
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/storage/__tests__/object-store.test.ts`
Expected: FAIL with `Cannot find module '../object-store'`.

- [ ] **Step 3: Write the adapter**

```ts
// src/lib/storage/object-store.ts
import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  presignPut(key: string, contentType: string, expiresIn?: number): Promise<string>;
  presignGet(key: string, expiresIn?: number): Promise<string>;
  head(key: string): Promise<{ exists: true; contentLength: number; contentType: string } | { exists: false }>;
  delete(key: string): Promise<void>;
}

const DEFAULT_EXPIRY = 300; // 5 minutes, matches the previous s3.ts constant

function disabledStore(): ObjectStore {
  const fail = (): never => {
    throw new Error("Object storage is disabled (STORAGE_DRIVER=disabled)");
  };
  return { put: fail, presignPut: fail, presignGet: fail, head: fail, delete: fail };
}

function s3CompatibleStore(bucket: string, endpoint?: string): ObjectStore {
  const client = new S3Client({
    region: process.env.AWS_SES_REGION ?? "ap-south-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async presignPut(key, contentType, expiresIn = DEFAULT_EXPIRY) {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
      return getSignedUrl(client as any, command, { expiresIn });
    },
    async presignGet(key, expiresIn = DEFAULT_EXPIRY) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 sub-package type mismatch
      return getSignedUrl(client as any, command, { expiresIn });
    },
    async head(key) {
      try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          exists: true,
          contentLength: response.ContentLength ?? 0,
          contentType: response.ContentType ?? "application/octet-stream",
        };
      } catch (error: unknown) {
        if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
          return { exists: false };
        }
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

let cached: ObjectStore | null = null;

/** Selected once by STORAGE_DRIVER; s3 and minio share the SDK, minio adds a custom endpoint. */
export function getObjectStore(): ObjectStore {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "s3";
  if (driver === "disabled") {
    cached = disabledStore();
    return cached;
  }
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) throw new Error("S3_BUCKET_NAME is required when STORAGE_DRIVER is not disabled");
  if (driver === "minio") {
    const endpoint = process.env.S3_ENDPOINT;
    if (!endpoint) throw new Error("S3_ENDPOINT is required when STORAGE_DRIVER=minio");
    cached = s3CompatibleStore(bucket, endpoint);
    return cached;
  }
  cached = s3CompatibleStore(bucket);
  return cached;
}
```

- [ ] **Step 4: Run the unit tests**

Run: `pnpm vitest run src/lib/storage/__tests__/object-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Turn `s3.ts` into a facade**

Replace the body of `src/lib/s3.ts` (keep `validateFileType`, `generateS3Key`, `generateBmEvidenceS3Key`, `ALLOWED_FILE_TYPES`, `MAX_FILE_SIZE` exactly as they are — they are pure/validation helpers, not storage calls) with the storage calls delegating to `getObjectStore()`:

```ts
// src/lib/s3.ts — imports section
import "server-only";
import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";
import { getObjectStore } from "./storage/object-store";
// (drop the @aws-sdk/client-s3, s3-request-presigner imports and the S3Client/BUCKET/PRESIGNED_URL_EXPIRY constants — object-store.ts owns those now)
```

```ts
// generateUploadUrl — unchanged signature, delegates
export async function generateUploadUrl(
  s3Key: string,
  contentType: string,
  fileSize: number,
): Promise<string> {
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File size ${fileSize} bytes exceeds the 10 MB limit`);
  }
  return getObjectStore().presignPut(s3Key, contentType);
}

export async function generateDownloadUrl(s3Key: string): Promise<string> {
  return getObjectStore().presignGet(s3Key);
}

export async function verifyUpload(
  s3Key: string,
): Promise<{ exists: true; contentLength: number; contentType: string } | { exists: false }> {
  return getObjectStore().head(s3Key);
}

export async function uploadToS3(options: { key: string; body: Buffer; contentType: string }): Promise<string> {
  await getObjectStore().put(options.key, options.body, options.contentType);
  return options.key;
}
```

Leave `validateFileType`, `generateS3Key`, `generateBmEvidenceS3Key`, `ALLOWED_FILE_TYPES`, `MAX_FILE_SIZE` untouched — they contain no storage-driver logic.

- [ ] **Step 6: Env schema**

In `src/env.ts` add:

```ts
    STORAGE_DRIVER: z.enum(["s3", "minio", "disabled"]).default("s3"),
    S3_ENDPOINT: z.string().url().optional(), // required when STORAGE_DRIVER=minio
```

and the matching `runtimeEnv` entries. `S3_BUCKET_NAME` already exists in the schema as `.optional()` — change it to required-when-not-disabled is enforced in `object-store.ts` itself (Step 3), not in the Zod schema, since the requirement is conditional on another field's value.

- [ ] **Step 7: Typecheck, existing S3 callers, full unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 type errors. The 8 existing callers of `s3.ts` (`src/app/api/reports/board-report/route.ts`, `src/app/api/download/route.ts` and its test, `src/actions/auditee.ts`, `src/actions/audit-execution/upload-examination-evidence.ts`, `src/actions/rbia/bm-evidence.ts`, `src/actions/reports/generate-pdf.ts`, `src/actions/reports/generate-xlsx.ts`) need no changes — their imports and call signatures are unchanged. All unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storage src/lib/s3.ts src/env.ts
git commit -m "feat(storage): driver-selectable ObjectStore (s3/minio/disabled), no silent bucket fallback"
```

---

### Task 2: Mail adapter — `Mailer` with an SMTP driver

**Files:**
- Create: `src/lib/mail/mailer.ts`
- Create: `src/lib/mail/__tests__/mailer.test.ts`
- Modify: `src/lib/invitation-mailer.ts`, `src/jobs/notification-processor.ts`
- Delete: `src/lib/ses-client.ts`
- Modify: `src/env.ts`, `package.json` (new dependency `nodemailer`)

**Interfaces:**
- Consumes: `env.MAIL_DRIVER`, `env.SMTP_HOST/PORT/USER/PASSWORD`, `env.AWS_SES_REGION`, `env.SES_FROM_EMAIL`.
- Produces: `Mailer` type, `getMailer(): Mailer` with `send(params: SendEmailParams): Promise<SendEmailResult>` — same shape `sendEmail` had in `ses-client.ts`, so both callers change only their import line and the function name.

- [ ] **Step 1: Add nodemailer**

Run: `pnpm add nodemailer && pnpm add -D @types/nodemailer`

- [ ] **Step 2: Write the failing unit test**

```ts
// src/lib/mail/__tests__/mailer.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "smtp-msg-1" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

const sesSendMock = vi.fn(async () => ({ MessageId: "ses-msg-1" }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn(() => ({ send: sesSendMock })),
  SendEmailCommand: vi.fn((input) => ({ input })),
}));

describe("getMailer", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMailMock.mockClear();
    sesSendMock.mockClear();
  });

  it("smtp driver calls nodemailer and returns the message id", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    const { getMailer } = await import("../mailer");
    const result = await getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "<p>hi</p>" });
    expect(result).toEqual({ success: true, messageId: "smtp-msg-1" });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" }),
    );
    vi.unstubAllEnvs();
  });

  it("the disabled driver throws loudly on first use", async () => {
    vi.stubEnv("MAIL_DRIVER", "disabled");
    const { getMailer } = await import("../mailer");
    await expect(getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "x" })).rejects.toThrow(
      /mail is disabled/i,
    );
    vi.unstubAllEnvs();
  });

  it("a transport failure returns a structured error, never throws", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));
    const { getMailer } = await import("../mailer");
    const result = await getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "x" });
    expect(result).toEqual({ success: false, error: "connection refused" });
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/mail/__tests__/mailer.test.ts`
Expected: FAIL with `Cannot find module '../mailer'`.

- [ ] **Step 4: Write the adapter**

```ts
// src/lib/mail/mailer.ts
import "server-only";
import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
}

export type SendEmailResult = { success: true; messageId: string } | { success: false; error: string };

export interface Mailer {
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

function disabledMailer(): Mailer {
  return {
    async send() {
      throw new Error("Mail is disabled (MAIL_DRIVER=disabled)");
    },
  };
}

function sesMailer(): Mailer {
  let client: SESv2Client | null = null;
  const getClient = () => {
    if (!client) {
      client = new SESv2Client({
        region: process.env.AWS_SES_REGION ?? "ap-south-1",
        ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? { credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }
          : {}),
      });
    }
    return client;
  };
  return {
    async send(params) {
      const fromEmail = process.env.SES_FROM_EMAIL;
      if (!fromEmail) return { success: false, error: "SES_FROM_EMAIL is not configured" };
      try {
        const command = new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: { ToAddresses: [params.to] },
          ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
          Content: {
            Simple: {
              Subject: { Data: params.subject },
              Body: {
                Html: { Data: params.htmlBody },
                ...(params.textBody ? { Text: { Data: params.textBody } } : {}),
              },
            },
          },
        });
        const response = await getClient().send(command);
        return { success: true, messageId: response.MessageId ?? "unknown" };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown SES error" };
      }
    },
  };
}

function smtpMailer(): Mailer {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) {
    throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required when MAIL_DRIVER=smtp");
  }
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass: password } });
  return {
    async send(params) {
      try {
        const info = await transport.sendMail({
          to: params.to,
          from: user,
          replyTo: params.replyTo,
          subject: params.subject,
          html: params.htmlBody,
          text: params.textBody,
        });
        return { success: true, messageId: info.messageId };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown SMTP error" };
      }
    },
  };
}

let cached: Mailer | null = null;

/** Selected once by MAIL_DRIVER. */
export function getMailer(): Mailer {
  if (cached) return cached;
  const driver = process.env.MAIL_DRIVER ?? "ses";
  cached = driver === "disabled" ? disabledMailer() : driver === "smtp" ? smtpMailer() : sesMailer();
  return cached;
}
```

- [ ] **Step 5: Run the unit tests**

Run: `pnpm vitest run src/lib/mail/__tests__/mailer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Repoint the two callers, delete `ses-client.ts`**

In `src/lib/invitation-mailer.ts`, replace `import { sendEmail } from "@/lib/ses-client";` with `import { getMailer } from "@/lib/mail/mailer";` and `const result = await sendEmail({...})` with `const result = await getMailer().send({...})`. Same substitution in `src/jobs/notification-processor.ts`. Then:

```bash
git rm src/lib/ses-client.ts
```

- [ ] **Step 7: Env schema**

In `src/env.ts` add:

```ts
    MAIL_DRIVER: z.enum(["ses", "smtp", "disabled"]).default("ses"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
```

and the matching `runtimeEnv` entries.

- [ ] **Step 8: Typecheck and full unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all PASS. `grep -rn "ses-client" src` returns nothing.

- [ ] **Step 9: Commit**

```bash
git add src/lib/mail src/lib/invitation-mailer.ts src/jobs/notification-processor.ts src/env.ts package.json pnpm-lock.yaml
git commit -m "feat(mail): driver-selectable Mailer (ses/smtp/disabled), retire ses-client.ts"
```

---

### Task 3: Inline the next-intl compatibility shim, then delete it

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/signup-form.tsx`, `src/components/layout/top-bar.tsx`, `src/components/layout/app-sidebar.tsx`, `src/components/reports/print-button.tsx`
- Delete: `src/lib/strings.ts`, `src/lib/strings.en.json`

**Interfaces:**
- Consumes: `src/lib/strings.en.json`'s current namespace/key contents (read them; do not guess the English text).
- Produces: nothing new — this task only removes indirection.

**Context:** next-intl the package is already gone (§1a: removed in the seed commit, confirmed absent from `package.json`); what remains is `src/lib/strings.ts`, a same-call-shape shim (`useTranslations(ns)` / `getTranslations(ns)`) over `src/lib/strings.en.json`, used in the 6 files above. This task finishes what §9's "remove next-intl" bullet actually still requires here: replacing the shim calls with the plain strings, then deleting the shim.

- [ ] **Step 1: Read every namespace the 6 files actually use**

Run: `grep -n "useTranslations(\|getTranslations(" src/app/\(auth\)/login/page.tsx src/components/auth/login-form.tsx src/components/auth/signup-form.tsx src/components/layout/top-bar.tsx src/components/layout/app-sidebar.tsx src/components/reports/print-button.tsx`

Then open `src/lib/strings.en.json` and copy out each namespace object used, so every replacement string below is the exact existing English text — not rewritten prose.

- [ ] **Step 2: Replace shim calls file by file**

For each file, replace

```ts
import { useTranslations } from "@/lib/strings"; // or getTranslations for the one async server-component call site
// …
const t = useTranslations("Login");
// …
{t("signIn")}
{t("subtitle", { count: n })}
```

with the literal strings from that namespace, keeping any `{vars}` interpolation inline:

```tsx
// …
{"Sign in"}
{`Something happened ${n} times`} // exact text and variable name from strings.en.json's "subtitle" entry
```

Prefer removing the `{"literal"}` JSX-expression wrapper for plain text (`Sign in` directly as JSX children) and keep template-literal interpolation only where the original had `{vars}` substitution. Do this for all 6 files; there is no shared constant to extract because each string is used in exactly one place today (`grep -c` each key in `strings.en.json` across the 6 files to confirm before inlining — if a key is used in two files, still inline both, duplication of a two-word UI label is not a DRY violation worth a shared constant).

- [ ] **Step 3: Run typecheck after each file, then the full unit suite**

Run: `pnpm tsc --noEmit` after each file (to catch a missed import) and `pnpm test:unit` once at the end.
Expected: 0 errors; all tests PASS (some component tests may assert exact text — if a test breaks because it asserted the interpolated form, update the assertion to the same literal text, not different text).

- [ ] **Step 4: Delete the shim**

```bash
git rm src/lib/strings.ts src/lib/strings.en.json
grep -rn "from \"@/lib/strings\"\|useTranslations\|getTranslations" src
```
Expected: no output from the grep.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(i18n): inline the next-intl compatibility shim's English strings, delete strings.ts"
```

---

### Task 4: Password reset over the new `Mailer`

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/emails/templates/password-reset-email.tsx`
- Modify: `src/emails/render.ts`
- Create: `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`
- Create: `src/lib/auth/__tests__/password-reset-email.test.ts` (or beside the render test if one exists — check first)

**Interfaces:**
- Consumes: `getMailer()` from Task 2; Better Auth's `emailAndPassword.sendResetPassword(data: { user, url, token }, request)` callback shape (client library: `authClient.forgetPassword({ email, redirectTo })` and `authClient.resetPassword({ newPassword, token })`, both already available from the existing `better-auth` client import used elsewhere in `src/lib/auth-client.ts` — read that file first to match its existing export style before adding two new client calls).
- Produces: nothing new consumed elsewhere in this plan.

- [ ] **Step 1: Confirm the auth client's existing shape**

Run: `cat src/lib/auth-client.ts` (or wherever the client-side Better Auth instance is created — search `grep -rln "createAuthClient" src`) and note the exported client's name before writing the two new pages, so they call the real export.

- [ ] **Step 2: Wire the server-side callback**

In `src/lib/auth.ts`, inside the `emailAndPassword` block, add:

```ts
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      const { renderEmailTemplate } = await import("@/emails/render");
      const { getMailer } = await import("@/lib/mail/mailer");
      const { subject, html, text } = await renderEmailTemplate("password-reset", {
        bankName: "AEGIS",
        userName: user.name ?? user.email,
        resetUrl: url,
      });
      const result = await getMailer().send({ to: user.email, subject, htmlBody: html, textBody: text });
      if (!result.success) {
        throw new Error(`Failed to send password reset email: ${result.error}`);
      }
    },
  },
```

(Dynamic imports here avoid pulling the mail stack into every request that constructs the `auth` object at module load — `src/lib/auth.ts` is imported broadly; check whether other Better Auth callbacks in this file already use top-level imports instead, and if so use a top-level import for consistency rather than dynamic import.)

- [ ] **Step 3: Add the email template**

```tsx
// src/emails/templates/password-reset-email.tsx
import { Text } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface PasswordResetEmailProps {
  bankName: string;
  appUrl: string;
  userName: string;
  resetUrl: string;
}

export function PasswordResetEmail({ bankName, appUrl, userName, resetUrl }: PasswordResetEmailProps) {
  return (
    <EmailBaseLayout bankName={bankName} appUrl={appUrl} previewText="Reset your AEGIS password">
      <Text style={headingStyle}>Reset your password</Text>
      <Text style={bodyTextStyle}>
        {userName}, we received a request to reset your AEGIS password. If you did not make this
        request, ignore this email — your password will not change.
      </Text>
      <CtaButton href={resetUrl} text="Reset Password" />
      <Text style={noteStyle}>This link expires in 1 hour and can be used once.</Text>
    </EmailBaseLayout>
  );
}

export function getPasswordResetSubject(bankName: string): string {
  return `Reset your ${bankName} password`;
}

const headingStyle = { fontSize: "20px", fontWeight: 700, marginBottom: "12px" };
const bodyTextStyle = { fontSize: "14px", lineHeight: "22px", color: "#374151" };
const noteStyle = { fontSize: "12px", color: "#6b7280", marginTop: "16px" };
```

(Copy the exact `headingStyle`/`bodyTextStyle`/`noteStyle` values from `invitation-email.tsx` instead of retyping guessed ones — read that file's style constants first and reuse them verbatim so the two emails look consistent.)

- [ ] **Step 4: Register the template**

In `src/emails/render.ts`, add the import:

```ts
import { PasswordResetEmail, getPasswordResetSubject } from "./templates/password-reset-email";
```

and a case in the `switch`:

```ts
    case "password-reset":
      element = createElement(PasswordResetEmail, {
        bankName,
        appUrl,
        userName: p.userName ?? "",
        resetUrl: p.resetUrl ?? `${appUrl}/reset-password`,
      });
      subject = getPasswordResetSubject(bankName);
      break;
```

- [ ] **Step 5: Add the two pages**

```tsx
// src/app/(auth)/forgot-password/page.tsx
"use client";
import * as React from "react";
import { authClient } from "@/lib/auth-client"; // confirm this is the real export name from Step 1
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: authError } = await authClient.forgetPassword({
      email,
      redirectTo: "/reset-password",
    });
    if (authError) setError(authError.message ?? "Could not send reset email");
    else setSent(true);
  }

  if (sent) {
    return <p>If an account exists for {email}, a reset link has been sent.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Send reset link</Button>
    </form>
  );
}
```

```tsx
// src/app/(auth)/reset-password/page.tsx
"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: authError } = await authClient.resetPassword({ newPassword: password, token });
    if (authError) setError(authError.message ?? "Could not reset password");
    else router.push("/login?reset=success");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="New password" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Reset password</Button>
    </form>
  );
}
```

Match these two pages' JSX to the styling conventions of the existing `src/app/(auth)/login/page.tsx` (form field wrapper, label placement) rather than the bare shape above — read that file first and mirror its layout primitives.

- [ ] **Step 6: Typecheck and unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/emails/templates/password-reset-email.tsx src/emails/render.ts src/app/\(auth\)/forgot-password src/app/\(auth\)/reset-password
git commit -m "feat(auth): password reset over the Mailer interface, closes #126"
```

---

### Task 5: `prisma migrate` replaces `prisma db push`

**Files:**
- Create: `prisma/migrations/0_baseline/migration.sql`, `prisma/migrations/migration_lock.toml`
- Delete: `prisma/migrations/20260209_dashboard_views.sql`, `prisma/migrations/20260222_rbia_db_guards.sql`, `prisma/migrations/20260826_audit_trigger_null_safe.sql` (folded into the baseline or into `prisma/sql/manifest.ts` — see Step 1)
- Modify: `package.json` (scripts), `CLAUDE.md` (Commands section), `prisma/CLAUDE.md`

**Interfaces:**
- Consumes: the current live schema (this repo has no production data — §1a — so a baseline-and-mark-applied approach is safe; there is nothing to migrate forward from).
- Produces: `pnpm db:migrate` — runs `prisma migrate deploy` then `db:bootstrap` then `db:verify`, replacing the current `pnpm db:generate && pnpm db:push && pnpm db:bootstrap && pnpm db:verify && pnpm db:seed` sequence documented in `CLAUDE.md`.

**Context:** `prisma/migrations/` today holds three loose, manually-named `.sql` files (`20260209_dashboard_views.sql`, `20260222_rbia_db_guards.sql`, `20260826_audit_trigger_null_safe.sql`) that are NOT in Prisma's migration format (no `migration_lock.toml`, no per-migration subdirectory) — `prisma migrate` cannot see them as migrations at all today. Read each file first: if its content duplicates something `prisma/sql/manifest.ts`'s bootstrap files already apply (views, guard triggers, the null-safety fix), it belongs in the manifest, not as a migration, and should move there instead of into the baseline. If it's a genuine schema change not yet reflected in `prisma/schema.prisma`, reconcile the schema file itself before baselining.

- [ ] **Step 1: Read and classify the three existing files**

Run: `cat prisma/migrations/20260209_dashboard_views.sql prisma/migrations/20260222_rbia_db_guards.sql prisma/migrations/20260826_audit_trigger_null_safe.sql`

For each: if it creates a view/trigger/function that has a "views"/"triggers"/"functions" bucket already tracked in `prisma/sql/manifest.ts`'s `SQL_MANIFEST`/`REQUIRED_OBJECTS`, move its content into a new numbered file there (following the existing `0NN_description.sql` naming already in `prisma/sql/`) instead of a Prisma migration, and add it to the manifest and `REQUIRED_OBJECTS`. If it's a genuine table/column change, it belongs in `schema.prisma` (confirm the change is already reflected there — since this repo's schema was hand-maintained without migrations, it likely already is) and needs no separate action beyond the baseline in Step 2 capturing the current schema state.

- [ ] **Step 2: Generate the baseline**

```bash
mkdir -p prisma/migrations/0_baseline
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql
```

This produces the full current-state DDL as a single migration. Do not hand-edit it.

- [ ] **Step 3: Retire the three loose files**

```bash
git rm prisma/migrations/20260209_dashboard_views.sql prisma/migrations/20260222_rbia_db_guards.sql prisma/migrations/20260826_audit_trigger_null_safe.sql
```

(Any content moved to `prisma/sql/` in Step 1 was already `git add`ed there — this only removes the old loose copies.)

- [ ] **Step 4: Mark the baseline as applied on every environment that already has this schema**

Every existing database (dev, CI, this worktree's test databases) already has the current schema applied via `db push`, so the baseline must be marked resolved rather than re-run:

```bash
npx prisma migrate resolve --applied 0_baseline
```

Document this exact command in `prisma/CLAUDE.md` under a new "One-time baseline" note, since anyone with a pre-existing local database needs to run it once too.

- [ ] **Step 5: Add the `db:migrate` script**

In `package.json` scripts, add:

```json
    "db:migrate": "prisma migrate deploy && tsx scripts/db-bootstrap.ts && tsx scripts/db-verify.ts",
```

Leave `db:push` in place for now (a fast local iteration path still has legitimate uses — schema prototyping before cutting a migration) but change `CLAUDE.md`'s Commands block first line from:

```
pnpm db:generate && pnpm db:push && pnpm db:bootstrap && pnpm db:verify && pnpm db:seed
```

to:

```
pnpm db:generate && pnpm db:migrate && pnpm db:seed
```

- [ ] **Step 6: Run it against a real database and verify**

Run: `pnpm db:generate && pnpm db:migrate && pnpm db:seed`
Expected: `prisma migrate deploy` reports the baseline as already applied (from Step 4) with no pending migrations, `db:verify` prints `All required database objects present.`, seed completes.

- [ ] **Step 7: Update CI**

In `.github/workflows/ci.yml`, wherever a job runs `db:push` today (the `integration-test` job and both e2e jobs per Task 3 of the tenant-isolation plan), change it to `db:migrate` instead. Read the current job steps first — Task 3 of the tenant-isolation-rls plan may have already run and changed these same lines to use `DATABASE_OWNER_URL`; if so, this change only swaps `db:push` for `db:migrate`, it does not touch the owner-URL wiring.

- [ ] **Step 8: Commit**

```bash
git add prisma/migrations prisma/sql package.json CLAUDE.md prisma/CLAUDE.md .github/workflows/ci.yml
git commit -m "chore(db): baseline prisma migrate, retire the three loose ad-hoc migration files"
```

---

### Task 6: License file — Ed25519 signing, verification, and the CLI

**Files:**
- Create: `src/lib/license.ts`, `src/lib/__tests__/license.test.ts`
- Create: `scripts/aegis-license.ts`
- Modify: `src/instrumentation.ts`, `src/env.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `LicenseFile` type (`tenantId`, `allowedHosts: string[]`, `issuedAt`, `expiresAt`, `gracePeriodDays`, `features: string[]`, `maxUsers`), `verifyLicense(raw: string, publicKeyPem: string): LicenseVerifyResult`, `loadLicense(): LicenseVerifyResult` (reads `env.LICENSE_FILE_PATH`), used by Task 7's `getFeatureFlags`.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/__tests__/license.test.ts
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signLicense, verifyLicense, type LicensePayload } from "../license";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const BASE_PAYLOAD: LicensePayload = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  allowedHosts: ["bank.example.com"],
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  gracePeriodDays: 14,
  features: ["core"],
  maxUsers: 50,
};

describe("license sign/verify round trip", () => {
  it("a validly signed license verifies, host and expiry within range", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, { host: "bank.example.com", now: new Date("2026-06-01") });
    expect(result).toEqual({ status: "valid", payload: BASE_PAYLOAD });
  });

  it("a tampered payload fails signature verification", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const parsed = JSON.parse(raw);
    parsed.payload.maxUsers = 999999;
    const tampered = JSON.stringify(parsed);
    const result = verifyLicense(tampered, publicKeyPem, { host: "bank.example.com", now: new Date("2026-06-01") });
    expect(result).toEqual({ status: "invalid", reason: "signature" });
  });

  it("an expired license outside the grace period is invalid", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, { host: "bank.example.com", now: new Date("2027-02-01") });
    expect(result).toEqual({ status: "invalid", reason: "expired" });
  });

  it("an expired license inside the grace period is valid with a grace flag", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, { host: "bank.example.com", now: new Date("2027-01-10") });
    expect(result).toEqual({ status: "grace", payload: BASE_PAYLOAD, daysRemaining: 4 });
  });

  it("a host not in allowedHosts is invalid", () => {
    const raw = signLicense(BASE_PAYLOAD, privateKeyPem);
    const result = verifyLicense(raw, publicKeyPem, { host: "other.example.com", now: new Date("2026-06-01") });
    expect(result).toEqual({ status: "invalid", reason: "host" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/license.test.ts`
Expected: FAIL with `Cannot find module '../license'`.

- [ ] **Step 3: Write `license.ts`**

```ts
// src/lib/license.ts
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface LicensePayload {
  tenantId: string;
  allowedHosts: string[];
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  features: string[];
  maxUsers: number;
}

interface SignedLicense {
  payload: LicensePayload;
  signature: string; // base64
}

export type LicenseVerifyResult =
  | { status: "valid"; payload: LicensePayload }
  | { status: "grace"; payload: LicensePayload; daysRemaining: number }
  | { status: "invalid"; reason: "signature" | "expired" | "host" | "malformed" };

/** Deterministic byte representation signed and verified — key order matters. */
function canonicalBytes(payload: LicensePayload): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, canonicalBytes(payload), key).toString("base64");
  const signed: SignedLicense = { payload, signature };
  return JSON.stringify(signed);
}

export function verifyLicense(
  raw: string,
  publicKeyPem: string,
  ctx: { host: string; now: Date },
): LicenseVerifyResult {
  let signed: SignedLicense;
  try {
    signed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "malformed" };
  }
  if (!signed.payload || !signed.signature) return { status: "invalid", reason: "malformed" };

  const key = createPublicKey(publicKeyPem);
  const signatureValid = verify(null, canonicalBytes(signed.payload), key, Buffer.from(signed.signature, "base64"));
  if (!signatureValid) return { status: "invalid", reason: "signature" };

  if (!signed.payload.allowedHosts.includes(ctx.host)) return { status: "invalid", reason: "host" };

  const expiresAt = new Date(signed.payload.expiresAt);
  if (ctx.now <= expiresAt) return { status: "valid", payload: signed.payload };

  const graceEndsAt = new Date(expiresAt.getTime() + signed.payload.gracePeriodDays * 24 * 60 * 60 * 1000);
  if (ctx.now <= graceEndsAt) {
    const msRemaining = graceEndsAt.getTime() - ctx.now.getTime();
    return { status: "grace", payload: signed.payload, daysRemaining: Math.ceil(msRemaining / (24 * 60 * 60 * 1000)) };
  }

  return { status: "invalid", reason: "expired" };
}

/** Reads env.LICENSE_FILE_PATH and env.LICENSE_PUBLIC_KEY; called once at boot by instrumentation.ts. */
export function loadLicense(host: string): LicenseVerifyResult {
  const filePath = process.env.LICENSE_FILE_PATH;
  const publicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  if (!filePath || !publicKeyPem) return { status: "invalid", reason: "malformed" };
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const raw = readFileSync(filePath, "utf8");
  return verifyLicense(raw, publicKeyPem, { host, now: new Date() });
}
```

- [ ] **Step 4: Run the unit tests**

Run: `pnpm vitest run src/lib/__tests__/license.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Boot-time check in `instrumentation.ts`**

Read the current contents of `src/instrumentation.ts` first — Next.js 16's `register()` export runs once per server start. Add a license check that only runs in the Node.js runtime (not the edge runtime, which `instrumentation.ts` can also be invoked for):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.LICENSE_FILE_PATH) {
      const { loadLicense } = await import("@/lib/license");
      const host = process.env.NEXT_PUBLIC_APP_URL
        ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
        : "localhost";
      const result = loadLicense(host);
      if (result.status === "invalid") {
        throw new Error(`License check failed (${result.reason}). Refusing to start.`);
      }
      if (result.status === "grace") {
        console.warn(
          `[license] Running in the grace period, ${result.daysRemaining} day(s) remaining. Renew before it ends.`,
        );
      }
    }
    // (existing instrumentation.ts contents, if any, stay below/above this block — check what's there first)
  }
}
```

If `LICENSE_FILE_PATH` is unset, the app boots without a license check — that's the SaaS/no-license-file case Task 7's feature-flag source depends on, not an oversight.

- [ ] **Step 6: The CLI**

```ts
// scripts/aegis-license.ts
import { generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { signLicense, verifyLicense, type LicensePayload } from "../src/lib/license";

function usage(): never {
  console.error(
    "Usage:\n" +
      "  tsx scripts/aegis-license.ts generate-keypair <out-prefix>\n" +
      "  tsx scripts/aegis-license.ts issue --private-key <path> --tenant-id <uuid> --hosts <csv> --features <csv> --max-users <n> --expires <ISO date> [--grace-days <n>] --out <path>\n" +
      "  tsx scripts/aegis-license.ts inspect --public-key <path> --host <host> <license-file>",
  );
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "generate-keypair") {
    const prefix = args[0];
    if (!prefix) usage();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    writeFileSync(`${prefix}.private.pem`, privateKey.export({ type: "pkcs8", format: "pem" }));
    writeFileSync(`${prefix}.public.pem`, publicKey.export({ type: "spki", format: "pem" }));
    console.log(`Wrote ${prefix}.private.pem (keep this off the repo and the Docker image) and ${prefix}.public.pem`);
    return;
  }

  if (cmd === "issue") {
    const privateKeyPath = flag(args, "--private-key");
    const tenantId = flag(args, "--tenant-id");
    const hosts = flag(args, "--hosts");
    const features = flag(args, "--features");
    const maxUsers = flag(args, "--max-users");
    const expires = flag(args, "--expires");
    const out = flag(args, "--out");
    const graceDays = flag(args, "--grace-days") ?? "14";
    if (!privateKeyPath || !tenantId || !hosts || !features || !maxUsers || !expires || !out) usage();
    const payload: LicensePayload = {
      tenantId,
      allowedHosts: hosts.split(","),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(expires).toISOString(),
      gracePeriodDays: Number(graceDays),
      features: features.split(","),
      maxUsers: Number(maxUsers),
    };
    const raw = signLicense(payload, readFileSync(privateKeyPath, "utf8"));
    writeFileSync(out, raw);
    console.log(`Wrote ${out}`);
    return;
  }

  if (cmd === "inspect") {
    const publicKeyPath = flag(args, "--public-key");
    const host = flag(args, "--host");
    const file = args[args.length - 1];
    if (!publicKeyPath || !host || !file || file.startsWith("--")) usage();
    const result = verifyLicense(readFileSync(file, "utf8"), readFileSync(publicKeyPath, "utf8"), { host, now: new Date() });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
}

main();
```

Add to `package.json` scripts: `"license": "tsx scripts/aegis-license.ts"`.

- [ ] **Step 7: Env schema**

In `src/env.ts` add:

```ts
    LICENSE_FILE_PATH: z.string().min(1).optional(),
    LICENSE_PUBLIC_KEY: z.string().min(1).optional(),
```

and the matching `runtimeEnv` entries.

- [ ] **Step 8: Manual round-trip**

```bash
pnpm license generate-keypair /tmp/aegis-dev
pnpm license issue --private-key /tmp/aegis-dev.private.pem --tenant-id 11111111-1111-4111-8111-111111111111 \
  --hosts localhost --features core --max-users 50 --expires 2027-01-01 --out /tmp/dev-license.aegis
pnpm license inspect --public-key /tmp/aegis-dev.public.pem --host localhost /tmp/dev-license.aegis
```

Expected: the inspect command prints `"status": "valid"`.

- [ ] **Step 9: Typecheck and unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/license.ts src/lib/__tests__/license.test.ts scripts/aegis-license.ts src/instrumentation.ts src/env.ts package.json
git commit -m "feat(license): Ed25519-signed license file, boot-time verification, aegis-license CLI"
```

---

### Task 7: Feature flags — license features (on-prem) or `Tenant.settings` (SaaS)

**Files:**
- Create: `src/lib/feature-flags.ts`, `src/lib/__tests__/feature-flags.test.ts`

**Interfaces:**
- Consumes: `LicenseVerifyResult` from Task 6; `Tenant.settings: Json?` (already in `prisma/schema.prisma`, no migration needed — a JSON blob keyed `{ features: string[] }` for the SaaS path).
- Produces: `getFeatureFlags(tenant: { settings: unknown }, license: LicenseVerifyResult | null): Set<string>`, used by later plans (module admin / non-core module gating) to decide nav visibility and redirect non-core routes. This task only produces the function and its tests — wiring it into nav/route guards is out of scope here (no non-core module routes exist yet in this repository; that wiring belongs to whichever later plan re-introduces a ported module behind a flag).

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/__tests__/feature-flags.test.ts
import { describe, expect, it } from "vitest";
import { getFeatureFlags } from "../feature-flags";
import type { LicenseVerifyResult } from "../license";

describe("getFeatureFlags", () => {
  it("core is always present, license absent or unset falls back to tenant.settings", () => {
    const tenant = { settings: { features: ["housing_loans"] } };
    const flags = getFeatureFlags(tenant, null);
    expect(flags.has("core")).toBe(true);
    expect(flags.has("housing_loans")).toBe(true);
  });

  it("a valid license's features win over tenant.settings", () => {
    const tenant = { settings: { features: ["housing_loans"] } };
    const license: LicenseVerifyResult = {
      status: "valid",
      payload: {
        tenantId: "t1",
        allowedHosts: [],
        issuedAt: "",
        expiresAt: "",
        gracePeriodDays: 0,
        features: ["term_loans"],
        maxUsers: 10,
      },
    };
    const flags = getFeatureFlags(tenant, license);
    expect(flags.has("term_loans")).toBe(true);
    expect(flags.has("housing_loans")).toBe(false);
    expect(flags.has("core")).toBe(true);
  });

  it("a grace-period license still uses its features (running, with a banner elsewhere)", () => {
    const license: LicenseVerifyResult = {
      status: "grace",
      daysRemaining: 3,
      payload: {
        tenantId: "t1",
        allowedHosts: [],
        issuedAt: "",
        expiresAt: "",
        gracePeriodDays: 14,
        features: ["term_loans"],
        maxUsers: 10,
      },
    };
    const flags = getFeatureFlags({ settings: null }, license);
    expect(flags.has("term_loans")).toBe(true);
  });

  it("malformed tenant.settings falls back to core only, never throws", () => {
    const flags = getFeatureFlags({ settings: "not-an-object" }, null);
    expect(flags).toEqual(new Set(["core"]));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/feature-flags.test.ts`
Expected: FAIL with `Cannot find module '../feature-flags'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/feature-flags.ts
import type { LicenseVerifyResult } from "./license";

const CORE = "core";

/**
 * On-prem: a loaded license's features (valid or grace — a grace-period
 * license keeps running, spec §8.3) are authoritative. Otherwise (no
 * license file configured — the SaaS case) read tenant.settings.features.
 * core is always included regardless of source.
 */
export function getFeatureFlags(tenant: { settings: unknown }, license: LicenseVerifyResult | null): Set<string> {
  if (license && (license.status === "valid" || license.status === "grace")) {
    return new Set([CORE, ...license.payload.features]);
  }
  const settings = tenant.settings;
  const features =
    settings && typeof settings === "object" && Array.isArray((settings as { features?: unknown }).features)
      ? ((settings as { features: unknown[] }).features.filter((f): f is string => typeof f === "string"))
      : [];
  return new Set([CORE, ...features]);
}
```

- [ ] **Step 4: Run the unit tests, typecheck, full unit suite**

Run: `pnpm vitest run src/lib/__tests__/feature-flags.test.ts && pnpm tsc --noEmit && pnpm test:unit`
Expected: PASS (4 tests), 0 type errors, full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feature-flags.ts src/lib/__tests__/feature-flags.test.ts
git commit -m "feat(license): getFeatureFlags reads license features on-prem, Tenant.settings for SaaS"
```

---

## Self-review

**Spec coverage (§8, next-intl bullet of §9, §11 weeks 6–7):**
- §8.1 adapters, disabled-mode-fails-loudly, no silent bucket fallback → Task 1 (storage), Task 2 (mail). Sentry-optional-at-build-time is already true today — Sentry is not a dependency in this repository at all (confirmed absent from `package.json`); no task needed.
- §8.2 `prisma migrate`, `db:bootstrap`/`db:verify` remain idempotent checks → Task 5.
- §8.3 Ed25519 license file, boot verification, grace banner, daily re-check, `scripts/aegis-license` → Task 6. The "daily re-check job" is deliberately not built as a separate pg-boss job in this plan: `instrumentation.ts` verifies once per process start, which on a long-running Node process without a restart schedule would not re-check daily on its own — **this is a real gap**, flagged rather than silently built partially: a later plan (or a follow-up task here, at the controller's discretion) should add a `src/jobs/license-recheck.ts` pg-boss recurring job that calls `loadLicense()` and logs/alerts on a status change, following the existing job patterns in `src/jobs/`. Not built here because no pg-boss job scaffolding was in scope for this plan's file list and adding one is a distinct, separately-testable unit.
- §8.4 feature flags, `core` always on → Task 7. Wiring flags into nav-entry visibility and route redirects is explicitly deferred (no non-core routes exist in this repository yet to gate — they return when a module is ported behind a flag, per §1a).
- §8.5 backups/encryption/restore drills → not in this plan; belongs to the deployment/drills plan (§11 week 13).
- §8.6 password reset over `Mailer`, closes #126 → Task 4.
- §9 next-intl → Task 3, scoped to what's actually left (the shim, not the already-removed package).

**Placeholder scan:** no TBD/TODO. Task 5's baseline migration file is generated by a command, not hand-typed, by design. Task 6 Step 8's manual round-trip writes to `/tmp/` deliberately (throwaway dev keys, never committed).

**Type consistency:** `ObjectStore`/`getObjectStore` (Task 1) is used only inside `s3.ts`, no cross-task consumer. `Mailer`/`getMailer`/`SendEmailParams`/`SendEmailResult` (Task 2) match the shape `sendEmail` had before, so Task 4's `sendResetPassword` callback and the pre-existing `invitation-mailer.ts` call the same signature. `LicensePayload`/`LicenseVerifyResult`/`loadLicense` (Task 6) are the exact names Task 7 imports.

**Known risks to watch during execution:**
- Task 5's `prisma migrate diff --from-empty` baseline approach is only safe because this repository genuinely has no production data yet (§1a) and every existing database is disposable dev/CI state marked `--applied` rather than replayed. If this plan executes after real customer data exists, the baseline step must not run — re-verify §1a's premise still holds at execution time.
- Task 6's `loadLicense` uses `require("node:fs")` inside an otherwise-ESM-style file to avoid top-level `fs` import inside a function that may run in edge-incompatible contexts; if the project's lint config forbids `require()`, switch to a top-level `import { readFileSync } from "node:fs"` instead — check `pnpm lint` output on this file specifically.
- The daily license re-check job gap noted above under §8.3 coverage is real and should become its own follow-up task, not silently dropped.
