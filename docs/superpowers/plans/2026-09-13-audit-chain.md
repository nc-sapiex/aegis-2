# Audit Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every audited write is chained to the one before it with a per-tenant SHA-256 hash a superuser cannot forge without detection, a nightly job proves the chain unbroken for every tenant, and a CAE/SYSTEM_ADMIN can see the last verification and pull a signed attestation for an examiner.

**Architecture:** `AuditLog` gains `prevHash`/`rowHash` (`Bytes`); a new `AuditChainHead(tenantId PK, lastSequence, lastHash)` row per tenant is the single source the trigger locks with `SELECT … FOR UPDATE` before computing the next link, so `sequenceNumber` becomes genuinely per-tenant instead of the current global-autoincrement column (which already produces false-positive gaps under multi-tenant traffic — see Self-Review). A pure module (`src/lib/audit-chain.ts`) implements the identical hash algorithm in TypeScript so the nightly `verify-audit-chain` job and its unit tests never touch the database to know what a row's hash *should* be. Immutability is enforced twice: `REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_app` (already applied by the tenant-isolation plan's `grantAppRole()`) plus new `DO INSTEAD NOTHING` rules that block even a superuser or the owner role from mutating a row through ordinary SQL.

**Tech Stack:** PostgreSQL 16 (`pgcrypto`, already enabled via `prisma/schema.prisma`'s `extensions = [pgcrypto, pg_trgm]`), Prisma 7.4, pg-boss, `@react-pdf/renderer` (already a dependency), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §5 (Audit chain), §10 (Verification — tamper tests, human gate on §5), §11 weeks 4–5, §12 (per-tenant chain lock risk).

**Depends on:** `docs/superpowers/plans/2026-09-13-tenant-isolation-rls.md`. This plan assumes that plan's Task 3 has landed on `main`: the `aegis_app` role exists, `DATABASE_OWNER_URL` is wired in `.env.example`/CI/`docker-compose.yml`, and `grantAppRole()` in `scripts/db-bootstrap.ts` already runs `REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_app`. If that plan's spike (§4.1) failed and Task 8's fallback ran instead, the app still connects as `aegis_app` with that same revoke (the fallback only reverts the RLS *client wrapping*, not the role/grants) — this plan is unaffected either way.

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()` → `session.user.tenantId`. Never from params, body, headers or query.
- Every write to an audited table goes through `withAuditedMutation(actor, "domain.event_past", fn)`.
- Session GUCs read back as `''`, not NULL; SQL wraps them in `NULLIF(current_setting(..., true), '')`.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Domain arithmetic is pure: `src/lib/*-engine.ts`-style modules take values and return values, no Prisma, no clock, no I/O. `src/lib/audit-chain.ts` follows this rule.
- Every PR touching §5 gets a human review before merge (§10). Never merge with `--auto`.
- `docs/reference/` is generated; run `pnpm docs:reference` after schema or action changes and commit the output.
- Audited tables are declared in three places that must agree: `AUDITED_TABLES` in `src/lib/audit-triggers.ts`, `prisma/sql/020_attach_audit_triggers.sql`, `AUDIT_TRIGGER_TABLES` in `prisma/sql/manifest.ts`. `AuditLog` itself is never in that list — it is the destination table, not a source.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `AuditLog` gains `prevHash Bytes`, `rowHash Bytes`, drops `@default(autoincrement())` on `sequenceNumber`. New models `AuditChainHead`, `AuditChainVerification`. |
| `src/lib/audit-chain.ts` (new) | Pure: `hashRow(input, prevHash)`, `verifyChain(rows)`, `GENESIS_HASH`. The canonical algorithm both the trigger and the verify job agree on. |
| `src/lib/__tests__/audit-chain.test.ts` (new) | Unit tests, including a fixed test vector the SQL-side integration test reproduces. |
| `prisma/migrations/20260913_audit_chain.sql` (new) | Drops the old `sequenceNumber` sequence default; rewrites `audit_trigger_function()` to lock the tenant's head row, compute `rowHash`, advance `sequenceNumber` and the head; adds the `DO INSTEAD NOTHING` rules. |
| `prisma/sql/manifest.ts` (modify) | Adds the new migration file to `SQL_MANIFEST` after `020_attach_audit_triggers.sql`; adds `AuditChainHead`/`AuditChainVerification` awareness is not needed here (Prisma-managed tables), but `REQUIRED_OBJECTS.functions` and a new `rules` key are added. |
| `scripts/db-verify.ts` (modify) | Asserts `audit_trigger_function` still exists (already does), plus the two new `DO INSTEAD NOTHING` rules and that `aegis_app` cannot `UPDATE`/`DELETE` `AuditLog` (`has_table_privilege`). |
| `scripts/backfill-audit-chain.ts` (new) | One-off: hashes pre-existing `AuditLog` rows per tenant in `sequenceNumber` order, creates each tenant's `AuditChainHead`. Runs against `DATABASE_OWNER_URL`, before the immutability rules exist (see Task 6's ordering note). |
| `src/data-access/audit-trail.ts` (modify) | `detectAuditGaps` rewritten against `AuditChainHead.lastSequence` instead of `MIN`/`MAX` over a shared column. |
| `src/jobs/verify-audit-chain.ts` (new) | Nightly: walks every tenant's chain via `verifyChain`, writes `AuditChainVerification`, queues a CRITICAL notification to CAE/SYSTEM_ADMIN on the first mismatch. |
| `src/jobs/index.ts`, `src/lib/job-queue.ts` (modify) | Register and schedule `verify-audit-chain` at 02:00 IST. |
| `prisma/schema.prisma` (modify, same file as above) | `NotificationType` gains `AUDIT_CHAIN_TAMPER_DETECTED`. |
| `src/data-access/audit-chain-admin.ts` (new) | DAL: `getChainVerifications(tenantId)`, `getChainHead(tenantId)`. |
| `src/actions/admin/run-audit-chain-verification.ts` (new) | Server action: run-now button, `admin:system` permission. |
| `src/actions/admin/export-chain-attestation.ts` (new) | Server action: renders the signed attestation PDF. |
| `src/components/pdf-report/chain-attestation.tsx` (new) | `@react-pdf/renderer` document: tenant, chain head, verification history, an Ed25519-style note that the export itself is stamped with the app's license signature (reuses whatever signing key the licensing plan introduces — see Self-Review). |
| `src/app/(dashboard)/admin/audit-chain/page.tsx` (new) | Admin page: last verification per tenant, run-now button, export button. |
| `src/components/admin/audit-chain-panel.tsx` (new) | Client component: the page's interactive body. |
| `src/data-access/__integration__/audit-chain.test.ts` (new) | Three clean writes verify OK; superuser `UPDATE` of a middle row is caught by row; superuser `DELETE` is caught by both a sequence gap and a chain break. |

---

### Task 1: Schema — hash columns and the two new tables

**Files:**
- Modify: `prisma/schema.prisma` (`AuditLog` model, `NotificationType` enum, two new models)
- Test: `src/lib/__tests__/sql-manifest.test.ts` (extend `REQUIRED_OBJECTS.functions` expectation — no new function yet, this task is schema-only)

**Interfaces:**
- Consumes: nothing.
- Produces: `AuditLog.prevHash: Buffer`, `AuditLog.rowHash: Buffer` (both nullable until Task 5's backfill and Task 3's trigger rewrite land — see the ordering note in Task 6); `AuditChainHead { tenantId, lastSequence: bigint, lastHash: Buffer, updatedAt }`; `AuditChainVerification { id, tenantId, verifiedAt, ok, firstBadSequence: bigint | null }`; `NotificationType.AUDIT_CHAIN_TAMPER_DETECTED`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, inside `model AuditLog`, after `sequenceNumber BigInt @default(autoincrement())` change it to:

```prisma
  sequenceNumber BigInt
```

(The `@default(autoincrement())` is removed — Task 3's trigger sets it explicitly from the tenant's head row. Removing the annotation does not touch the underlying `AuditLog_sequenceNumber_seq` sequence Postgres already created; Task 3 drops that default at the database level too.)

Add two columns to the same model, after `retentionExpiresAt`:

```prisma
  // Per-tenant hash chain (spec §5). NULL only transiently: nullable so
  // `prisma db push` can add the column before the backfill (Task 5) and
  // the trigger rewrite (Task 3) populate every row.
  prevHash Bytes?
  rowHash  Bytes?
```

Add `@@unique([tenantId, sequenceNumber])` to `AuditLog`'s index block (it already has `@@index([tenantId])`):

```prisma
  @@unique([tenantId, sequenceNumber])
```

Add two new models near `AuditLog`:

```prisma
model AuditChainHead {
  tenantId    String   @id @db.Uuid
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lastSequence BigInt  @default(0)
  lastHash    Bytes
  updatedAt   DateTime @updatedAt
}

model AuditChainVerification {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String   @db.Uuid
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  verifiedAt       DateTime @default(now())
  ok               Boolean
  firstBadSequence BigInt?

  @@index([tenantId, verifiedAt])
}
```

Add the relation fields on `Tenant` (find the model and add, near its other one-to-many relations):

```prisma
  auditChainHead          AuditChainHead?
  auditChainVerifications AuditChainVerification[]
```

In the `NotificationType` enum, add one value:

```prisma
enum NotificationType {
  OBSERVATION_ASSIGNED
  RESPONSE_SUBMITTED
  DEADLINE_REMINDER_7D
  DEADLINE_REMINDER_3D
  DEADLINE_REMINDER_1D
  OVERDUE_ESCALATION
  WEEKLY_DIGEST
  BULK_DIGEST
  INVITATION
  AUDIT_CHAIN_TAMPER_DETECTED
}
```

- [ ] **Step 2: Push and generate**

Run: `pnpm db:generate && pnpm db:push`
Expected: `AuditLog`, `AuditChainHead`, `AuditChainVerification` reflect the new shape; no data loss (the two new columns are nullable, the two new tables are empty).

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 errors. (Nothing references the new fields/tables yet, so this only proves the schema itself is valid Prisma.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(audit): schema for the per-tenant hash chain (AuditChainHead, AuditChainVerification)"
```

---

### Task 2: Pure hash module

**Files:**
- Create: `src/lib/audit-chain.ts`
- Create: `src/lib/__tests__/audit-chain.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `GENESIS_HASH: Buffer` (32 zero bytes); `type ChainableRow = { tenantId: string; sequenceNumber: bigint; tableName: string; recordId: string; operation: string; actorUserId: string | null; changedAt: Date; oldData: unknown; newData: unknown }`; `hashRow(row: ChainableRow, prevHash: Buffer): Buffer`; `verifyChain(rows: ChainableRow[], genesisPrevHash?: Buffer): { ok: true } | { ok: false; firstBadSequence: bigint }` where each row is also expected to carry its own `prevHash`/`rowHash` for the second signature below.

Task 3's SQL trigger and this module MUST compute byte-identical hashes for the same logical row, or the nightly verify job will report every tenant as tampered from day one. The canonical string format is spelled out below; do not deviate from it in either language.

- [ ] **Step 1: Write the failing unit tests**

```ts
// src/lib/__tests__/audit-chain.test.ts
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { GENESIS_HASH, hashRow, verifyChain, type ChainableRow } from "@/lib/audit-chain";

function row(overrides: Partial<ChainableRow> = {}): ChainableRow {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    sequenceNumber: 1n,
    tableName: "Branch",
    recordId: "22222222-2222-4222-8222-222222222222",
    operation: "INSERT",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    changedAt: new Date("2026-09-13T10:15:30.123Z"),
    oldData: null,
    newData: { code: "A001", name: "A Branch" },
    ...overrides,
  };
}

describe("hashRow", () => {
  it("is a deterministic 32-byte value for a fixed test vector", () => {
    const expectedCanonical =
      "0000000000000000000000000000000000000000000000000000000000000000" +
      "|11111111-1111-4111-8111-111111111111|1|Branch|22222222-2222-4222-8222-222222222222|INSERT" +
      "|33333333-3333-4333-8333-333333333333|2026-09-13T10:15:30.123Z" +
      "|null|" +
      JSON.stringify({ code: "A001", name: "A Branch" });
    const expected = createHash("sha256").update(expectedCanonical).digest();

    const result = hashRow(row(), GENESIS_HASH);

    expect(result).toEqual(expected);
    expect(result).toHaveLength(32);
  });

  it("changes when any single field changes (avalanche, not exhaustive)", () => {
    const base = hashRow(row(), GENESIS_HASH);
    const changedRecordId = hashRow(row({ recordId: "99999999-9999-4999-8999-999999999999" }), GENESIS_HASH);
    const changedNewData = hashRow(row({ newData: { code: "A001", name: "Tampered" } }), GENESIS_HASH);
    const changedPrevHash = hashRow(row(), Buffer.alloc(32, 1));

    expect(changedRecordId.equals(base)).toBe(false);
    expect(changedNewData.equals(base)).toBe(false);
    expect(changedPrevHash.equals(base)).toBe(false);
  });

  it("a null actorUserId (system actor) hashes to the empty-string slot, not the literal 'null'", () => {
    const withSystemActor = hashRow(row({ actorUserId: null }), GENESIS_HASH);
    const withEmptyString = hashRow(row({ actorUserId: "" }), GENESIS_HASH);
    expect(withSystemActor.equals(withEmptyString)).toBe(true);
  });
});

describe("verifyChain", () => {
  function chainOf(rows: ChainableRow[]): (ChainableRow & { prevHash: Buffer; rowHash: Buffer })[] {
    let prev = GENESIS_HASH;
    return rows.map((r) => {
      const rowHash = hashRow(r, prev);
      const linked = { ...r, prevHash: prev, rowHash };
      prev = rowHash;
      return linked;
    });
  }

  it("reports ok for a clean chain of three rows", () => {
    const rows = chainOf([row({ sequenceNumber: 1n }), row({ sequenceNumber: 2n }), row({ sequenceNumber: 3n })]);
    expect(verifyChain(rows)).toEqual({ ok: true });
  });

  it("reports the first bad sequence when a middle row's data was edited after hashing", () => {
    const rows = chainOf([row({ sequenceNumber: 1n }), row({ sequenceNumber: 2n }), row({ sequenceNumber: 3n })]);
    rows[1] = { ...rows[1], newData: { code: "A001", name: "Edited by a superuser" } };
    expect(verifyChain(rows)).toEqual({ ok: false, firstBadSequence: 2n });
  });

  it("reports the first bad sequence when a middle row is deleted (gap in prevHash linkage)", () => {
    const rows = chainOf([row({ sequenceNumber: 1n }), row({ sequenceNumber: 2n }), row({ sequenceNumber: 3n })]);
    const withGap = [rows[0], rows[2]]; // row 2 deleted; row 3's prevHash no longer matches row 1's rowHash
    expect(verifyChain(withGap)).toEqual({ ok: false, firstBadSequence: 3n });
  });

  it("an empty chain is ok", () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/audit-chain.test.ts`
Expected: FAIL, `Cannot find module '@/lib/audit-chain'`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/audit-chain.ts
import { createHash } from "node:crypto";

/**
 * Per-tenant SHA-256 hash chain (spec §5).
 *
 * Canonical string, joined with "|", in this exact order — the SQL trigger in
 * prisma/migrations/20260913_audit_chain.sql builds the identical string so
 * the nightly verify job can recompute it without touching the database:
 *
 *   hex(prevHash) | tenantId | sequenceNumber | tableName | recordId
 *     | operation | actorUserId-or-empty | changedAt.toISOString()
 *     | JSON.stringify(oldData)-or-"null" | JSON.stringify(newData)-or-"null"
 *
 * A null actorUserId (systemActor, spec's "the platform acting under policy")
 * canonicalizes to the empty string, matching how setSessionContext leaves
 * app.current_user_id unset for a system Actor (session-context.ts) rather
 * than writing the literal text "null".
 *
 * Pure: no Prisma, no clock, no I/O — CLAUDE.md's domain-arithmetic rule.
 */

export const GENESIS_HASH: Buffer = Buffer.alloc(32);

export type ChainableRow = {
  tenantId: string;
  sequenceNumber: bigint;
  tableName: string;
  recordId: string;
  operation: string;
  actorUserId: string | null;
  changedAt: Date;
  oldData: unknown;
  newData: unknown;
};

function canonicalString(row: ChainableRow, prevHash: Buffer): string {
  return [
    prevHash.toString("hex"),
    row.tenantId,
    row.sequenceNumber.toString(),
    row.tableName,
    row.recordId,
    row.operation,
    row.actorUserId ?? "",
    row.changedAt.toISOString(),
    row.oldData === null || row.oldData === undefined ? "null" : JSON.stringify(row.oldData),
    row.newData === null || row.newData === undefined ? "null" : JSON.stringify(row.newData),
  ].join("|");
}

export function hashRow(row: ChainableRow, prevHash: Buffer): Buffer {
  return createHash("sha256").update(canonicalString(row, prevHash)).digest();
}

export type LinkedRow = ChainableRow & { prevHash: Buffer; rowHash: Buffer };

/**
 * Walks rows in sequence order (caller's responsibility to sort). Verifies
 * each row's own rowHash against its recorded data, and that each row's
 * prevHash equals the previous row's rowHash (genesis excepted).
 */
export function verifyChain(
  rows: LinkedRow[],
  genesisPrevHash: Buffer = GENESIS_HASH,
): { ok: true } | { ok: false; firstBadSequence: bigint } {
  let expectedPrev = genesisPrevHash;
  for (const row of rows) {
    if (!row.prevHash.equals(expectedPrev)) {
      return { ok: false, firstBadSequence: row.sequenceNumber };
    }
    const expectedHash = hashRow(row, row.prevHash);
    if (!expectedHash.equals(row.rowHash)) {
      return { ok: false, firstBadSequence: row.sequenceNumber };
    }
    expectedPrev = row.rowHash;
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/__tests__/audit-chain.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-chain.ts src/lib/__tests__/audit-chain.test.ts
git commit -m "feat(audit): pure hashRow/verifyChain module, the algorithm the trigger and verify job share"
```

---

### Task 3: Rewrite the trigger to compute the chain

**Files:**
- Create: `prisma/migrations/20260913_audit_chain.sql`
- Modify: `prisma/sql/manifest.ts` (`SQL_MANIFEST`, `REQUIRED_OBJECTS.functions` unchanged — `audit_trigger_function` already listed)
- Modify: `src/lib/__tests__/sql-manifest.test.ts`

**Interfaces:**
- Consumes: `AUDITED_TABLES` from `src/lib/audit-triggers.ts` (the trigger fires on the same tables as before — this task changes the function's body, not which tables carry it).
- Produces: every `AuditLog` row inserted from this point on carries `sequenceNumber`, `prevHash`, `rowHash` matching `src/lib/audit-chain.ts`'s algorithm exactly.

- [ ] **Step 1: Write the failing manifest test**

Append to `src/lib/__tests__/sql-manifest.test.ts`:

```ts
describe("audit chain migration", () => {
  it("is present in the manifest after the audit trigger attachment", () => {
    const i = SQL_MANIFEST.indexOf("prisma/migrations/20260913_audit_chain.sql");
    const j = SQL_MANIFEST.indexOf("prisma/sql/020_attach_audit_triggers.sql");
    expect(i).toBeGreaterThan(j);
  });

  it("the migration file computes rowHash with pgcrypto digest(...,'sha256')", () => {
    const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260913_audit_chain.sql"), "utf8");
    expect(sql).toContain("digest(");
    expect(sql).toContain("'sha256'");
    expect(sql).toContain("FOR UPDATE");
  });
});
```

(`readFileSync`, `join`, `SQL_MANIFEST` are already imported at the top of that file, same as Plan 1's Task 4 addition.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/__tests__/sql-manifest.test.ts`
Expected: FAIL, file not found / not in manifest.

- [ ] **Step 3: Write the migration**

```sql
-- prisma/migrations/20260913_audit_chain.sql
--
-- Rewrites audit_trigger_function() (previously defined in
-- 20260826_audit_trigger_null_safe.sql) to compute a per-tenant SHA-256 hash
-- chain instead of a plain audit row. sequenceNumber moves from a shared
-- Postgres sequence (AuditLog_sequenceNumber_seq) to a value this function
-- assigns itself from each tenant's AuditChainHead row.
--
-- Canonical string built here MUST match src/lib/audit-chain.ts's
-- canonicalString() byte-for-byte: hex(prevHash) | tenantId | sequenceNumber
-- | tableName | recordId | operation | actorUserId-or-empty
-- | changedAt (ISO-8601, milliseconds, "Z") | oldData JSON-or-"null"
-- | newData JSON-or-"null".

ALTER TABLE "AuditLog" ALTER COLUMN "sequenceNumber" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "AuditLog_sequenceNumber_seq";

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  _action_type TEXT;
  _justification TEXT;
  _ip_address TEXT;
  _session_id TEXT;
  _user_id TEXT;
  _tenant_id TEXT;
  _record_id TEXT;
  _old_json JSONB;
  _new_json JSONB;
  _changed_at TIMESTAMPTZ;
  _prev_hash BYTEA;
  _next_sequence BIGINT;
  _canonical TEXT;
  _row_hash BYTEA;
BEGIN
  _action_type := NULLIF(current_setting('app.current_action', TRUE), '');
  _justification := NULLIF(current_setting('app.current_justification', TRUE), '');
  _ip_address := NULLIF(current_setting('app.current_ip_address', TRUE), '');
  _session_id := NULLIF(current_setting('app.current_session_id', TRUE), '');
  _user_id := NULLIF(current_setting('app.current_user_id', TRUE), '');
  _tenant_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '');

  _record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END;
  _old_json := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  _new_json := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  _changed_at := NOW();

  -- Lock (creating on first write) the tenant's head row so concurrent
  -- audited writes within the same tenant serialize; different tenants do
  -- not contend (spec §5, §12 risk: "not measurable at UCB scale").
  INSERT INTO "AuditChainHead" ("tenantId", "lastSequence", "lastHash", "updatedAt")
  VALUES (_tenant_id::UUID, 0, '\x0000000000000000000000000000000000000000000000000000000000000000'::BYTEA, NOW())
  ON CONFLICT ("tenantId") DO NOTHING;

  SELECT "lastSequence", "lastHash" INTO _next_sequence, _prev_hash
    FROM "AuditChainHead" WHERE "tenantId" = _tenant_id::UUID FOR UPDATE;
  _next_sequence := _next_sequence + 1;

  _canonical := encode(_prev_hash, 'hex') || '|' || _tenant_id || '|' || _next_sequence::TEXT
    || '|' || TG_TABLE_NAME || '|' || _record_id || '|' || TG_OP
    || '|' || coalesce(_user_id, '')
    || '|' || to_char(_changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    || '|' || coalesce(_old_json::TEXT, 'null')
    || '|' || coalesce(_new_json::TEXT, 'null');
  _row_hash := digest(_canonical, 'sha256');

  INSERT INTO "AuditLog" (
    id, "tenantId", "userId", "tableName", "recordId", operation, "actionType",
    justification, "oldData", "newData", "ipAddress", "sessionId",
    "retentionExpiresAt", "createdAt", "sequenceNumber", "prevHash", "rowHash"
  ) VALUES (
    gen_random_uuid(), _tenant_id::UUID, _user_id::UUID, TG_TABLE_NAME, _record_id, TG_OP,
    _action_type, _justification, _old_json, _new_json, _ip_address, _session_id,
    _changed_at + INTERVAL '10 years', _changed_at, _next_sequence, _prev_hash, _row_hash
  );

  UPDATE "AuditChainHead"
     SET "lastSequence" = _next_sequence, "lastHash" = _row_hash, "updatedAt" = NOW()
   WHERE "tenantId" = _tenant_id::UUID;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
```

Add to `prisma/sql/manifest.ts`'s `SQL_MANIFEST`, immediately after `"prisma/sql/020_attach_audit_triggers.sql"`:

```ts
  "prisma/migrations/20260913_audit_chain.sql",
```

- [ ] **Step 4: Run the manifest test, then bootstrap and verify**

Run: `pnpm vitest run src/lib/__tests__/sql-manifest.test.ts && pnpm db:bootstrap && pnpm db:verify`
Expected: manifest test PASS; `db:bootstrap` re-applies every file including the new one; `db:verify` prints `All required database objects present.` (no new check yet — that's Task 6).

- [ ] **Step 5: Prove the chain by hand**

```bash
psql "$DATABASE_OWNER_URL" -c "
  BEGIN;
  SELECT set_config('app.current_tenant_id', (SELECT id::text FROM \"Tenant\" LIMIT 1), true);
  UPDATE \"Branch\" SET name = name WHERE id = (SELECT id FROM \"Branch\" LIMIT 1);
  COMMIT;
"
psql "$DATABASE_OWNER_URL" -c 'SELECT "sequenceNumber", encode("prevHash",'"'"'hex'"'"'), encode("rowHash",'"'"'hex'"'"') FROM "AuditLog" ORDER BY "sequenceNumber" DESC LIMIT 2;'
```

Expected: the newest row's `prevHash` (hex) equals the previous row's `rowHash` (hex), and `sequenceNumber` incremented by exactly 1 within that tenant.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/20260913_audit_chain.sql prisma/sql/manifest.ts src/lib/__tests__/sql-manifest.test.ts
git commit -m "feat(audit): trigger computes the per-tenant hash chain on every audited write"
```

---

### Task 4: `detectAuditGaps` against the real per-tenant sequence

**Files:**
- Modify: `src/data-access/audit-trail.ts`
- Test: `src/data-access/__tests__/audit-trail.test.ts` (create if it does not already cover this function — check first: `test -f src/data-access/__tests__/audit-trail.test.ts`)

**Interfaces:**
- Consumes: `AuditChainHead` (Task 1), `AuditLog.sequenceNumber` (Task 3).
- Produces: `detectAuditGaps(tenantId: string): Promise<{ missingSequence: bigint }[]>` — same signature as today, corrected semantics.

- [ ] **Step 1: Read the existing implementation and note the bug this task fixes**

The current `detectAuditGaps` (`src/data-access/audit-trail.ts`) runs `generate_series(MIN(sequenceNumber), MAX(sequenceNumber))` filtered to one tenant, over a column that was, until Task 3, a single Postgres sequence shared by every tenant. Two tenants writing concurrently interleave values (tenant A gets 1, 3, 5; tenant B gets 2, 4, 6), so tenant A's own `MIN`/`MAX` range of 1–5 reports 2 and 4 as "missing" even though nothing was deleted — a standing false-positive. Task 3 makes `sequenceNumber` genuinely per-tenant (1, 2, 3, … with no gaps from other tenants), so the existing query becomes correct by construction; this task only needs to confirm that and add a regression test, since `AuditChainHead.lastSequence` is now the authoritative row count to cross-check against.

- [ ] **Step 2: Write the failing test**

Create `src/data-access/__tests__/audit-trail.test.ts` if absent (if it exists, append this `describe` block):

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

describe("detectAuditGaps", () => {
  it("reports no gaps when sequenceNumber is contiguous for the tenant", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { detectAuditGaps } = await import("@/data-access/audit-trail");
    const gaps = await detectAuditGaps("11111111-1111-4111-8111-111111111111");
    expect(gaps).toEqual([]);
  });

  it("reports a missing sequence number as a bigint", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ missing_sequence: 5n }]);
    const { detectAuditGaps } = await import("@/data-access/audit-trail");
    const gaps = await detectAuditGaps("11111111-1111-4111-8111-111111111111");
    expect(gaps).toEqual([{ missingSequence: 5n }]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails or passes for the wrong reason**

Run: `pnpm vitest run src/data-access/__tests__/audit-trail.test.ts`
Expected: the mock-based tests above actually PASS against the existing implementation immediately (they only assert the function's shape, not real gap semantics) — that is expected and fine; the real semantics fix is Task 3's trigger change, already landed. This step exists so the function has a regression test at all, since none existed before this plan.

- [ ] **Step 4: Add a doc comment correcting the stale claim, no logic change needed**

In `src/data-access/audit-trail.ts`, replace the `detectAuditGaps` doc comment:

```ts
/**
 * Detect gaps in a tenant's sequence number, for tamper detection.
 *
 * sequenceNumber is assigned per tenant by the audit trigger (spec §5,
 * prisma/migrations/20260913_audit_chain.sql), starting at 1 with no gaps
 * from other tenants' concurrent writes — unlike the single shared Postgres
 * sequence this column used before that migration, a gap reported here means
 * a row was deleted or a sequenceNumber was written out of band, not
 * ordinary multi-tenant interleaving.
 *
 * Uses raw SQL to generate series and find missing numbers.
 */
```

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data-access/audit-trail.ts src/data-access/__tests__/audit-trail.test.ts
git commit -m "test(audit): regression test for detectAuditGaps; correct its doc comment for the per-tenant sequence"
```

---

### Task 5: Backfill script

**Files:**
- Create: `scripts/backfill-audit-chain.ts`

**Interfaces:**
- Consumes: `hashRow`, `GENESIS_HASH` from `src/lib/audit-chain.ts`; connects via `DATABASE_OWNER_URL` (falls back to `DATABASE_URL`, same convention as `scripts/db-bootstrap.ts`).
- Produces: every pre-existing `AuditLog` row gets `sequenceNumber`/`prevHash`/`rowHash`; one `AuditChainHead` row per tenant with rows.

This script must run **before** Task 6's immutability rules exist — it `UPDATE`s existing `AuditLog` rows, which the `DO INSTEAD NOTHING` rule and the `aegis_app` revoke both block by design. If Task 6 has already landed when this runs, connect as the table owner and temporarily `DROP RULE`/recreate around the backfill (the script checks and refuses to proceed silently — see Step 3).

- [ ] **Step 1: Write the script**

```ts
// scripts/backfill-audit-chain.ts
//
// One-off: computes prevHash/rowHash/sequenceNumber for every pre-existing
// AuditLog row, oldest first per tenant, and creates that tenant's
// AuditChainHead. Safe to re-run: a tenant whose AuditChainHead already
// exists is skipped entirely (idempotent, not "re-hash and hope").
//
// Usage: DATABASE_OWNER_URL=... npx tsx scripts/backfill-audit-chain.ts

import { Client } from "pg";
import { hashRow, GENESIS_HASH, type ChainableRow } from "../src/lib/audit-chain";

async function main() {
  const connectionString = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const ruleCheck = await client.query<{ count: string }>(
      `SELECT count(*)::text FROM pg_rewrite WHERE rulename LIKE 'audit_log_no_%'`,
    );
    if (Number(ruleCheck.rows[0].count) > 0) {
      throw new Error(
        "AuditLog immutability rules already exist (Task 6 has landed). " +
          "This script cannot UPDATE existing rows through them. Drop the " +
          "audit_log_no_update / audit_log_no_delete rules first, re-run, " +
          "then recreate them — or run this script before applying Task 6's migration.",
      );
    }

    const { rows: tenants } = await client.query<{ id: string }>(`SELECT id FROM "Tenant"`);
    let totalRows = 0;

    for (const tenant of tenants) {
      const existingHead = await client.query(
        `SELECT 1 FROM "AuditChainHead" WHERE "tenantId" = $1`,
        [tenant.id],
      );
      if ((existingHead.rowCount ?? 0) > 0) {
        console.log(`tenant ${tenant.id}: AuditChainHead already exists, skipping`);
        continue;
      }

      const { rows } = await client.query<{
        id: string;
        tableName: string;
        recordId: string;
        operation: string;
        userId: string | null;
        createdAt: Date;
        oldData: unknown;
        newData: unknown;
      }>(
        `SELECT id, "tableName", "recordId", operation, "userId", "createdAt", "oldData", "newData"
           FROM "AuditLog" WHERE "tenantId" = $1 ORDER BY "createdAt" ASC, id ASC`,
        [tenant.id],
      );

      let prevHash = GENESIS_HASH;
      let sequence = 0n;

      for (const row of rows) {
        sequence += 1n;
        const chainable: ChainableRow = {
          tenantId: tenant.id,
          sequenceNumber: sequence,
          tableName: row.tableName,
          recordId: row.recordId,
          operation: row.operation,
          actorUserId: row.userId,
          changedAt: row.createdAt,
          oldData: row.oldData,
          newData: row.newData,
        };
        const rowHash = hashRow(chainable, prevHash);
        await client.query(
          `UPDATE "AuditLog" SET "sequenceNumber" = $1, "prevHash" = $2, "rowHash" = $3 WHERE id = $4`,
          [sequence, prevHash, rowHash, row.id],
        );
        prevHash = rowHash;
      }

      await client.query(
        `INSERT INTO "AuditChainHead" ("tenantId", "lastSequence", "lastHash", "updatedAt")
         VALUES ($1, $2, $3, NOW())`,
        [tenant.id, sequence, prevHash],
      );

      console.log(`tenant ${tenant.id}: backfilled ${rows.length} rows`);
      totalRows += rows.length;
    }

    console.log(`Backfill complete. ${totalRows} rows across ${tenants.length} tenants.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the local database**

Run: `npx tsx scripts/backfill-audit-chain.ts`
Expected: one line per tenant with existing `AuditLog` rows (the seeded database has at least one), `Backfill complete. N rows across M tenants.`

- [ ] **Step 3: Verify with the pure module**

```bash
npx tsx -e "
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client';
import { verifyChain } from './src/lib/audit-chain';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_OWNER_URL }) });
const tenants = await prisma.tenant.findMany({ select: { id: true } });
for (const t of tenants) {
  const rows = await prisma.auditLog.findMany({ where: { tenantId: t.id }, orderBy: { sequenceNumber: 'asc' } });
  const linked = rows.map((r) => ({
    tenantId: r.tenantId, sequenceNumber: r.sequenceNumber, tableName: r.tableName, recordId: r.recordId,
    operation: r.operation, actorUserId: r.userId, changedAt: r.createdAt, oldData: r.oldData, newData: r.newData,
    prevHash: r.prevHash, rowHash: r.rowHash,
  }));
  console.log(t.id, verifyChain(linked));
}
await prisma.\$disconnect();
"
```

Expected: every tenant prints `{ ok: true }`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-audit-chain.ts
git commit -m "feat(audit): one-off backfill script for pre-existing AuditLog rows"
```

---

### Task 6: Immutability rules and `db:verify`

**Files:**
- Create: `prisma/sql/070_audit_log_immutability.sql` (numbered after Task 4 of the RLS plan's `070_rls_policies.sql`; if that file does not exist because the RLS spike failed and Task 8's fallback ran, use `070_audit_log_immutability.sql` regardless — the number is about manifest ordering, not a hard dependency on RLS)
- Modify: `prisma/sql/manifest.ts` (`SQL_MANIFEST`, `REQUIRED_OBJECTS` gains a `rules` key)
- Modify: `scripts/db-verify.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `REQUIRED_OBJECTS.rules: readonly string[]` (`["audit_log_no_update", "audit_log_no_delete"]`), checked by `db:verify`.

**Ordering:** apply this task's migration only after Task 5's backfill has run against every environment that has pre-existing `AuditLog` data (local dev, any shared staging database). A fresh database (nothing in `AuditLog` yet) has no ordering concern — `pnpm db:bootstrap` on a clean database applies the whole manifest in one pass and there is nothing for the backfill to touch.

- [ ] **Step 1: Write the failing verify check**

Add to `scripts/db-verify.ts`, after the RLS-policy block Plan 1's Task 4 added (or after the role check if that plan's spike failed):

```ts
    const rules = await client.query<{ rulename: string }>(
      `SELECT rulename FROM pg_rewrite WHERE rulename IN ('audit_log_no_update', 'audit_log_no_delete')`,
    );
    const haveRules = new Set(rules.rows.map((r) => r.rulename));
    for (const rule of REQUIRED_OBJECTS.rules) {
      if (!haveRules.has(rule)) missing.push(`rule ${rule}`);
    }

    const revoked = await client.query<{ has_update: boolean; has_delete: boolean }>(
      `SELECT has_table_privilege('aegis_app', '"AuditLog"', 'UPDATE') AS has_update,
              has_table_privilege('aegis_app', '"AuditLog"', 'DELETE') AS has_delete`,
    );
    if (revoked.rows[0]?.has_update) missing.push("aegis_app must not have UPDATE on AuditLog");
    if (revoked.rows[0]?.has_delete) missing.push("aegis_app must not have DELETE on AuditLog");
```

- [ ] **Step 2: Run verify to see it fail**

Run: `pnpm db:verify`
Expected: exit 1 listing `- rule audit_log_no_update`, `- rule audit_log_no_delete` (the `aegis_app` privilege check should already pass if the RLS plan's `grantAppRole()` ran; if it does not, that plan's Task 3 needs to run first — do not add the REVOKE here, it already lives there).

- [ ] **Step 3: Write the rules**

```sql
-- prisma/sql/070_audit_log_immutability.sql
--
-- AuditLog immutability, defense in depth beyond the aegis_app REVOKE
-- (scripts/db-bootstrap.ts's grantAppRole()): these rules block UPDATE and
-- DELETE through ordinary SQL for every role, including the owner and a
-- superuser — the CI integration test's "superuser edit" case still reaches
-- the row (a rule rewrites the query before privilege checks even run for
-- some paths, but a superuser can still DISABLE RULE; that path is not
-- defended here on purpose, since spec §5's tamper test wants a superuser
-- edit to succeed at the SQL level and be *caught by the chain*, not blocked
-- outright — these rules cover the ordinary-privilege path, the hash chain
-- covers the superuser path).
DROP RULE IF EXISTS audit_log_no_update ON "AuditLog";
CREATE RULE audit_log_no_update AS ON UPDATE TO "AuditLog" DO INSTEAD NOTHING;

DROP RULE IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE RULE audit_log_no_delete AS ON DELETE TO "AuditLog" DO INSTEAD NOTHING;
```

Add to `prisma/sql/manifest.ts`'s `SQL_MANIFEST`, at the end:

```ts
  "prisma/sql/070_audit_log_immutability.sql",
```

Extend `RequiredObjects` and `REQUIRED_OBJECTS`:

```ts
export interface RequiredObjects {
  functions: readonly string[];
  views: readonly string[];
  triggers: readonly string[];
  constraints: readonly string[];
  rules: readonly string[];
}
// …
  rules: ["audit_log_no_update", "audit_log_no_delete"],
```

- [ ] **Step 4: Bootstrap and verify**

Run: `pnpm db:bootstrap && pnpm db:verify`
Expected: `All required database objects present.`

- [ ] **Step 5: Prove it by hand — the tamper test spec §5 asks for**

```bash
psql "$DATABASE_OWNER_URL" -c 'UPDATE "AuditLog" SET "actionType" = '"'"'tampered'"'"' WHERE "sequenceNumber" = 1;'
psql "$DATABASE_OWNER_URL" -c 'SELECT "actionType" FROM "AuditLog" WHERE "sequenceNumber" = 1;'
```

Expected: the `UPDATE` reports `UPDATE 0` and the second query shows the original `actionType`, unchanged — the rule silently discarded the write (Task 9's integration test covers the superuser-bypasses-the-rule path via `DISABLE RULE`, which is the case the hash chain, not the rule, is meant to catch).

- [ ] **Step 6: Commit**

```bash
git add prisma/sql/070_audit_log_immutability.sql prisma/sql/manifest.ts scripts/db-verify.ts
git commit -m "feat(audit): DO INSTEAD NOTHING rules block UPDATE/DELETE on AuditLog for every role"
```

---

### Task 7: Nightly verify job and the CRITICAL notification

**Files:**
- Create: `src/jobs/verify-audit-chain.ts`
- Create: `src/jobs/__tests__/verify-audit-chain.test.ts`
- Modify: `src/lib/job-queue.ts` (`JOB_NAMES`, `createQueue`, `schedule`)
- Modify: `src/jobs/index.ts` (`JOBS`, `registerJobs`)

**Interfaces:**
- Consumes: `verifyChain` from `src/lib/audit-chain.ts`; `withAuditedMutation`, `systemActor` from `src/data-access/audited-mutation.ts`.
- Produces: `verifyAuditChain(): Promise<void>`, exported for the job registration and for Task 8's run-now action to call directly.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/jobs/__tests__/verify-audit-chain.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockTenantFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args) },
    auditLog: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
  },
}));

vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(async (_actor: unknown, _action: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      auditChainVerification: { create: (...args: unknown[]) => mockCreate(...args) },
      notificationQueue: { create: vi.fn() },
    }),
  ),
  systemActor: (tenantId: string) => ({ kind: "system", tenantId }),
}));

describe("verifyAuditChain", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockTenantFindMany.mockReset();
    mockCreate.mockReset();
    mockUserFindMany.mockReset();
  });

  it("writes ok:true for a tenant with a clean chain", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1" }]);
    mockFindMany.mockResolvedValue([]);
    const { verifyAuditChain } = await import("@/jobs/verify-audit-chain");
    await verifyAuditChain();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", ok: true }) }),
    );
  });

  it("writes ok:false with firstBadSequence and queues a CRITICAL notification on a broken chain", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1" }]);
    mockFindMany.mockResolvedValue([
      {
        tenantId: "t1", sequenceNumber: 1n, tableName: "Branch", recordId: "r1", operation: "INSERT",
        userId: null, createdAt: new Date("2026-01-01T00:00:00.000Z"), oldData: null, newData: { a: 1 },
        prevHash: Buffer.alloc(32), rowHash: Buffer.from("wrong-hash-not-32-bytes-padded00", "utf8"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "u1" }]);
    const { verifyAuditChain } = await import("@/jobs/verify-audit-chain");
    await verifyAuditChain();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", ok: false, firstBadSequence: 1n }) }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/jobs/__tests__/verify-audit-chain.test.ts`
Expected: FAIL, `Cannot find module '@/jobs/verify-audit-chain'`.

- [ ] **Step 3: Write the job**

```ts
// src/jobs/verify-audit-chain.ts
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAuditedMutation, systemActor } from "@/data-access/audited-mutation";
import { verifyChain, type LinkedRow } from "@/lib/audit-chain";

/**
 * Nightly (02:00 IST): walk every tenant's AuditLog chain, record the
 * verdict, and raise a CRITICAL notification to CAE/SYSTEM_ADMIN on the
 * first tenant where it breaks. Spec §5.
 */
export async function verifyAuditChain(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sequenceNumber: "asc" },
      select: {
        tenantId: true, sequenceNumber: true, tableName: true, recordId: true, operation: true,
        userId: true, createdAt: true, oldData: true, newData: true, prevHash: true, rowHash: true,
      },
    });

    const linked: LinkedRow[] = rows.map((r) => ({
      tenantId: r.tenantId,
      sequenceNumber: r.sequenceNumber,
      tableName: r.tableName,
      recordId: r.recordId,
      operation: r.operation,
      actorUserId: r.userId,
      changedAt: r.createdAt,
      oldData: r.oldData,
      newData: r.newData,
      prevHash: r.prevHash as Buffer,
      rowHash: r.rowHash as Buffer,
    }));

    const verdict = verifyChain(linked);

    await withAuditedMutation(systemActor(tenant.id), "audit_chain.verified", async (tx) => {
      await tx.auditChainVerification.create({
        data: {
          tenantId: tenant.id,
          ok: verdict.ok,
          firstBadSequence: verdict.ok ? null : verdict.firstBadSequence,
        },
      });

      if (!verdict.ok) {
        const recipients = await prisma.user.findMany({
          where: { tenantId: tenant.id, roles: { hasSome: ["CAE", "SYSTEM_ADMIN"] as never } },
          select: { id: true },
        });
        for (const recipient of recipients) {
          await tx.notificationQueue.create({
            data: {
              tenantId: tenant.id,
              recipientId: recipient.id,
              type: "AUDIT_CHAIN_TAMPER_DETECTED",
              status: "PENDING",
              payload: { firstBadSequence: verdict.firstBadSequence.toString() },
            },
          });
        }
      }
    });

    logger.info(
      { action: "audit_chain_verified", tenantId: tenant.id, ok: verdict.ok },
      verdict.ok ? "Audit chain verified clean" : "Audit chain verification FAILED",
    );
  }
}
```

- [ ] **Step 4: Run the unit test**

Run: `pnpm vitest run src/jobs/__tests__/verify-audit-chain.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register and schedule**

In `src/lib/job-queue.ts`, add to `JOB_NAMES`:

```ts
  VERIFY_AUDIT_CHAIN: "verify-audit-chain",
```

In `startWorkers()`, add a queue and its schedule (02:00 IST = 20:30 UTC the previous day):

```ts
  await queue.createQueue(JOB_NAMES.VERIFY_AUDIT_CHAIN, QUEUE_OPTIONS);
  // …
  await queue.schedule(JOB_NAMES.VERIFY_AUDIT_CHAIN, "30 20 * * *"); // daily 20:30 UTC = 02:00 IST
```

In `src/jobs/index.ts`, import and register:

```ts
import { verifyAuditChain } from "./verify-audit-chain";
// … in JOBS:
  VERIFY_AUDIT_CHAIN: "verify-audit-chain",
// … in registerJobs():
  await boss.work(JOBS.VERIFY_AUDIT_CHAIN, async () => {
    await verifyAuditChain();
  });
```

- [ ] **Step 6: Typecheck and unit suite**

Run: `pnpm tsc --noEmit && pnpm test:unit`
Expected: 0 errors, all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/jobs/verify-audit-chain.ts src/jobs/__tests__/verify-audit-chain.test.ts src/lib/job-queue.ts src/jobs/index.ts
git commit -m "feat(audit): nightly verify-audit-chain job, CRITICAL notification on the first break"
```

---

### Task 8: Admin page — verification history, run-now, attestation export

**Files:**
- Create: `src/data-access/audit-chain-admin.ts`
- Create: `src/actions/admin/run-audit-chain-verification.ts`
- Create: `src/actions/admin/export-chain-attestation.ts`
- Create: `src/components/pdf-report/chain-attestation.tsx`
- Create: `src/app/(dashboard)/admin/audit-chain/page.tsx`
- Create: `src/components/admin/audit-chain-panel.tsx`

**Interfaces:**
- Consumes: `verifyAuditChain` from `src/jobs/verify-audit-chain.ts`; `requirePermission` from `src/lib/guards.ts`; the `"admin:system"` permission (already granted to `SYSTEM_ADMIN` in `src/lib/permissions.ts`).
- Produces: `getChainVerifications(tenantId): Promise<AuditChainVerification[]>`, `getChainHead(tenantId): Promise<{ lastSequence: bigint; lastHash: Buffer } | null>`.

- [ ] **Step 1: DAL**

```ts
// src/data-access/audit-chain-admin.ts
import "server-only";
import { prismaForTenant } from "@/lib/prisma";

export interface ChainVerificationRow {
  id: string;
  verifiedAt: Date;
  ok: boolean;
  firstBadSequence: bigint | null;
}

export async function getChainVerifications(tenantId: string): Promise<ChainVerificationRow[]> {
  const db = prismaForTenant(tenantId);
  return db.auditChainVerification.findMany({
    where: { tenantId },
    orderBy: { verifiedAt: "desc" },
    take: 30,
    select: { id: true, verifiedAt: true, ok: true, firstBadSequence: true },
  });
}

export async function getChainHead(
  tenantId: string,
): Promise<{ lastSequence: bigint; lastHash: Buffer; updatedAt: Date } | null> {
  const db = prismaForTenant(tenantId);
  const head = await db.auditChainHead.findUnique({ where: { tenantId } });
  return head ? { lastSequence: head.lastSequence, lastHash: head.lastHash as Buffer, updatedAt: head.updatedAt } : null;
}
```

- [ ] **Step 2: Run-now action**

```ts
// src/actions/admin/run-audit-chain-verification.ts
"use server";

import { getRequiredSession } from "@/lib/session";
import { requirePermission } from "@/lib/guards";
import { verifyAuditChain } from "@/jobs/verify-audit-chain";
import { getChainVerifications } from "@/data-access/audit-chain-admin";
import type { ActionResult } from "@/types";

export async function runAuditChainVerification(): Promise<
  ActionResult<{ latest: Awaited<ReturnType<typeof getChainVerifications>>[number] }>
> {
  await requirePermission("admin:system");
  const session = await getRequiredSession();

  try {
    await verifyAuditChain();
    const [latest] = await getChainVerifications(session.user.tenantId);
    if (!latest) return { success: false, error: "Verification ran but produced no record" };
    return { success: true, data: { latest } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Verification failed" };
  }
}
```

If `ActionResult<T>` is not already the project's shared discriminated-union type (check `src/types/index.ts` for `ActionResult`), use the same inline shape every other action in this codebase returns: `{ success: true; data: T } | { success: false; error: string }`, and skip the import.

- [ ] **Step 3: Attestation PDF document**

```tsx
// src/components/pdf-report/chain-attestation.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  label: { color: "#555" },
  section: { marginTop: 20 },
  historyRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 4 },
});

export interface ChainAttestationProps {
  tenantName: string;
  generatedAt: Date;
  head: { lastSequence: bigint; lastHash: Buffer; updatedAt: Date } | null;
  history: { verifiedAt: Date; ok: boolean; firstBadSequence: bigint | null }[];
}

export function ChainAttestation({ tenantName, generatedAt, head, history }: ChainAttestationProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Audit Chain Attestation</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Bank</Text>
          <Text>{tenantName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Generated</Text>
          <Text>{generatedAt.toISOString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Chain length</Text>
          <Text>{head ? head.lastSequence.toString() : "0"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Head hash (SHA-256)</Text>
          <Text>{head ? head.lastHash.toString("hex") : "—"}</Text>
        </View>
        <View style={styles.section}>
          <Text style={{ marginBottom: 8, fontSize: 13 }}>Recent verifications</Text>
          {history.map((h) => (
            <View key={h.verifiedAt.toISOString()} style={styles.historyRow}>
              <Text style={{ flex: 1 }}>{h.verifiedAt.toISOString()}</Text>
              <Text style={{ flex: 1 }}>{h.ok ? "OK" : `FAILED at #${h.firstBadSequence}`}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
```

(External signing of this export with the platform's Ed25519 licensing key is a licensing-plan concern — spec §8, not §5 — and is listed as a follow-up in this plan's Self-Review rather than built here, since that key does not exist yet in this repo.)

- [ ] **Step 4: Export action**

```ts
// src/actions/admin/export-chain-attestation.ts
"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { getRequiredSession } from "@/lib/session";
import { requirePermission } from "@/lib/guards";
import { prismaForTenant } from "@/lib/prisma";
import { getChainHead, getChainVerifications } from "@/data-access/audit-chain-admin";
import { ChainAttestation } from "@/components/pdf-report/chain-attestation";

export async function exportChainAttestation(): Promise<
  { success: true; data: { base64: string; filename: string } } | { success: false; error: string }
> {
  await requirePermission("admin:system");
  const session = await getRequiredSession();
  const tenantId = session.user.tenantId;

  try {
    const db = prismaForTenant(tenantId);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
    const [head, history] = await Promise.all([getChainHead(tenantId), getChainVerifications(tenantId)]);

    const buffer = await renderToBuffer(
      ChainAttestation({ tenantName: tenant.name, generatedAt: new Date(), head, history }),
    );

    return {
      success: true,
      data: { base64: buffer.toString("base64"), filename: `audit-chain-attestation-${tenantId}.pdf` },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Export failed" };
  }
}
```

- [ ] **Step 5: Page and panel**

```tsx
// src/app/(dashboard)/admin/audit-chain/page.tsx
import { requirePermission } from "@/lib/guards";
import { getRequiredSession } from "@/lib/session";
import { getChainHead, getChainVerifications } from "@/data-access/audit-chain-admin";
import { AuditChainPanel } from "@/components/admin/audit-chain-panel";

export default async function AuditChainAdminPage() {
  await requirePermission("admin:system");
  const session = await getRequiredSession();
  const [head, history] = await Promise.all([
    getChainHead(session.user.tenantId),
    getChainVerifications(session.user.tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">Audit Chain</h1>
        <p className="text-muted-foreground">
          Every audited write is chained by hash. Verification runs nightly at 02:00 IST.
        </p>
      </div>
      <AuditChainPanel
        head={head ? { lastSequence: head.lastSequence.toString(), lastHash: head.lastHash.toString("hex") } : null}
        history={history.map((h) => ({
          id: h.id,
          verifiedAt: h.verifiedAt.toISOString(),
          ok: h.ok,
          firstBadSequence: h.firstBadSequence?.toString() ?? null,
        }))}
      />
    </div>
  );
}
```

```tsx
// src/components/admin/audit-chain-panel.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { runAuditChainVerification } from "@/actions/admin/run-audit-chain-verification";
import { exportChainAttestation } from "@/actions/admin/export-chain-attestation";

interface AuditChainPanelProps {
  head: { lastSequence: string; lastHash: string } | null;
  history: { id: string; verifiedAt: string; ok: boolean; firstBadSequence: string | null }[];
}

export function AuditChainPanel({ head, history }: AuditChainPanelProps) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleRunNow() {
    setError(null);
    startTransition(async () => {
      const result = await runAuditChainVerification();
      if (!result.success) setError(result.error);
      else window.location.reload();
    });
  }

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportChainAttestation();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const byteCharacters = atob(result.data.base64);
      const bytes = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) bytes[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={handleRunNow} disabled={isPending}>
          {isPending ? "Running…" : "Run verification now"}
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={isPending}>
          Export attestation
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {head && (
        <p className="text-muted-foreground text-sm">
          Chain length {head.lastSequence} · head {head.lastHash.slice(0, 16)}…
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-2">Verified</th>
            <th className="py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-t">
              <td className="py-2">{new Date(h.verifiedAt).toLocaleString()}</td>
              <td className="py-2">{h.ok ? "OK" : `Failed at #${h.firstBadSequence}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Add a permission-menu entry if this codebase's sidebar/nav is data-driven from `src/lib/permissions.ts` or a nav config (check `src/components/layout` or `src/config` for the existing admin nav list before adding a new link) — wire this page in the same way the existing `admin/zones` entry is wired.

- [ ] **Step 6: Typecheck, unit suite, docs**

Run: `pnpm tsc --noEmit && pnpm test:unit && pnpm docs:reference`
Expected: 0 errors, all PASS, `docs/reference/api-reference.md` lists the two new actions.

- [ ] **Step 7: Commit**

```bash
git add src/data-access/audit-chain-admin.ts src/actions/admin/run-audit-chain-verification.ts src/actions/admin/export-chain-attestation.ts src/components/pdf-report/chain-attestation.tsx src/app/\(dashboard\)/admin/audit-chain src/components/admin/audit-chain-panel.tsx docs/reference
git commit -m "feat(audit): admin page for chain verification history, run-now, and attestation export"
```

---

### Task 9: Integration tamper tests

**Files:**
- Create: `src/data-access/__integration__/audit-chain.test.ts`

**Interfaces:**
- Consumes: `integrationOwner`, `integrationPrisma`, `createTenant`, `createUser`, `withFixtures`, `resetDatabase` from `tests/integration/harness.ts` (the RLS plan's Task 5 split; if that plan's spike failed, `integrationOwner` still exists as introduced there — its Task 5 runs regardless of the ADR verdict per that plan's own fallback notes) — `verifyChain` from `src/lib/audit-chain.ts`.
- Produces: the three tests spec §10 names verbatim: "three audited writes verify clean," "a superuser `UPDATE` of a middle row is reported by row," "a superuser `DELETE` is reported by both gap and chain."

- [ ] **Step 1: Write the test**

```ts
// src/data-access/__integration__/audit-chain.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyChain, type LinkedRow } from "@/lib/audit-chain";
import { detectAuditGaps } from "@/data-access/audit-trail";
import {
  createTenant,
  createUser,
  integrationOwner,
  integrationPrisma,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Chain Test Bank")).id;
    await createUser(tenantId, ["CAE"]);
  });
});

afterAll(async () => {
  await integrationOwner.$disconnect();
});

async function linkedRows(): Promise<LinkedRow[]> {
  const rows = await integrationOwner.auditLog.findMany({
    where: { tenantId },
    orderBy: { sequenceNumber: "asc" },
  });
  return rows.map((r) => ({
    tenantId: r.tenantId,
    sequenceNumber: r.sequenceNumber,
    tableName: r.tableName,
    recordId: r.recordId,
    operation: r.operation,
    actorUserId: r.userId,
    changedAt: r.createdAt,
    oldData: r.oldData,
    newData: r.newData,
    prevHash: r.prevHash as Buffer,
    rowHash: r.rowHash as Buffer,
  }));
}

describe("audit chain tamper detection", () => {
  it("three audited writes verify clean", async () => {
    // The tenant/user creation above already produced audited writes
    // (Tenant, User are both AUDITED_TABLES); write one more to guarantee
    // at least three total, then verify the whole chain.
    await integrationOwner.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await integrationOwner.branch.create({
      data: { tenantId, name: "Chain Test Branch", code: "CHN01" },
    });

    const rows = await linkedRows();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(verifyChain(rows)).toEqual({ ok: true });
  });

  it("a superuser UPDATE of a middle row is reported by that row's sequence", async () => {
    const before = await linkedRows();
    const middle = before[Math.floor(before.length / 2)];

    // The DO INSTEAD NOTHING rule blocks this through ordinary SQL; disable
    // the rule to simulate the privileged bypass spec §5's tamper test
    // targets (a superuser willing to alter the rule itself), matching
    // "070_audit_log_immutability.sql"'s own documented scope: the rule
    // stops ordinary privilege paths, the hash chain catches the rest.
    await integrationOwner.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE RULE audit_log_no_update`);
    try {
      await integrationOwner.$executeRaw`
        UPDATE "AuditLog" SET "actionType" = 'tampered-by-superuser'
        WHERE "sequenceNumber" = ${middle.sequenceNumber} AND "tenantId" = ${tenantId}::uuid`;
    } finally {
      await integrationOwner.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE RULE audit_log_no_update`);
    }

    const after = await linkedRows();
    const verdict = verifyChain(after);
    expect(verdict).toEqual({ ok: false, firstBadSequence: middle.sequenceNumber });
  });

  it("a superuser DELETE of a middle row is reported by both a sequence gap and the chain", async () => {
    await resetDatabase();
    let localTenantId = "";
    await withFixtures(async () => {
      localTenantId = (await createTenant("Delete Test Bank")).id;
      await createUser(localTenantId, ["CAE"]);
      await integrationOwner.$executeRaw`SELECT set_config('app.current_tenant_id', ${localTenantId}, true)`;
      await integrationOwner.branch.create({ data: { tenantId: localTenantId, name: "B1", code: "D001" } });
      await integrationOwner.branch.create({ data: { tenantId: localTenantId, name: "B2", code: "D002" } });
    });

    const before = await integrationOwner.auditLog.findMany({
      where: { tenantId: localTenantId },
      orderBy: { sequenceNumber: "asc" },
    });
    const middle = before[Math.floor(before.length / 2)];

    await integrationOwner.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE RULE audit_log_no_delete`);
    try {
      await integrationOwner.$executeRaw`
        DELETE FROM "AuditLog" WHERE "sequenceNumber" = ${middle.sequenceNumber} AND "tenantId" = ${localTenantId}::uuid`;
    } finally {
      await integrationOwner.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE RULE audit_log_no_delete`);
    }

    const gaps = await detectAuditGaps(localTenantId);
    expect(gaps).toEqual([{ missingSequence: middle.sequenceNumber }]);

    const rows = await integrationOwner.auditLog.findMany({
      where: { tenantId: localTenantId },
      orderBy: { sequenceNumber: "asc" },
    });
    const linked: LinkedRow[] = rows.map((r) => ({
      tenantId: r.tenantId, sequenceNumber: r.sequenceNumber, tableName: r.tableName, recordId: r.recordId,
      operation: r.operation, actorUserId: r.userId, changedAt: r.createdAt, oldData: r.oldData, newData: r.newData,
      prevHash: r.prevHash as Buffer, rowHash: r.rowHash as Buffer,
    }));
    const verdict = verifyChain(linked);
    expect(verdict).toEqual({ ok: false, firstBadSequence: middle.sequenceNumber + 1n });
  });
});
```

`detectAuditGaps` uses `prisma` (the app singleton, `aegis_app`), not `integrationOwner` — confirm this still works post-delete: `aegis_app` has `SELECT` on `AuditLog` (only `UPDATE`/`DELETE` are revoked), so the gap query succeeds as the app role exactly as it would in production.

- [ ] **Step 2: Run it**

Run: `pnpm test:integration -- src/data-access/__integration__/audit-chain.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Run the whole integration suite**

Run: `pnpm tsc --noEmit && pnpm test:integration`
Expected: PASS — confirms this task's `ALTER TABLE ... DISABLE RULE` / `ENABLE RULE` pairing does not leak a disabled rule into a later test file (the `finally` blocks guarantee this, but the full-suite run is the actual proof).

- [ ] **Step 4: Commit**

```bash
git add src/data-access/__integration__/audit-chain.test.ts
git commit -m "test(audit): tamper detection integration tests — clean chain, superuser UPDATE, superuser DELETE"
```

---

## Self-review

**Spec coverage (§5, relevant §10/§12 lines, §11 weeks 4-5):**
- `AuditLog` gains `prevHash`/`rowHash`; `AuditChainHead(tenantId PK, lastSequence, lastHash)` → Task 1.
- Trigger takes `SELECT … FOR UPDATE` on the head row, computes `rowHash` from the exact spec formula, advances the head; genesis `prevHash` is 32 zero bytes → Task 3.
- `sequenceNumber` becomes per tenant; `detectAuditGaps()` rewritten against it, called by the verify job → Task 3 (schema/trigger), Task 4 (function correctness note), Task 7 (job — note: the job's own tamper-detection uses `verifyChain` over the full row set, not `detectAuditGaps`; `detectAuditGaps` is exercised directly in Task 9's delete test, matching how the spec lists "detectAuditGaps... called by the verify job" as a capability that exists, which it now correctly does via `src/data-access/audit-trail.ts`, even though `verifyAuditChain()` itself calls `verifyChain` for the hash proof and would rather not duplicate work — see the discrepancy note below).
- Immutability: `DO INSTEAD NOTHING` rules plus `REVOKE UPDATE, DELETE` from `aegis_app` → Task 6 (rules) + the tenant-isolation plan's Task 3 (revoke, already landed by the time this plan runs).
- `src/lib/audit-chain.ts` pure module: `hashRow`, `verifyChain`, unit-tested → Task 2.
- Nightly `verify-audit-chain` at 02:00 IST, `AuditChainVerification`, CRITICAL notification to CAE and platform admin on first mismatch → Task 7.
- Admin page: last verification per tenant, run-now, export chain head + attestation PDF → Task 8.
- One-off backfill script → Task 5.
- Integration tests: three clean writes, superuser UPDATE reported by row, superuser DELETE reported by gap and chain → Task 9.
- External anchoring (§13, explicitly out of scope for this program) — not built, correctly excluded.
- §10 human gate ("every PR touching §4, §5, §8 gets a human review before merge") — restated in Global Constraints, not a task; it is a process requirement on whoever merges this plan's PR, same as the tenant-isolation plan's Task 8.
- §12 risk ("per-tenant chain lock… not measurable at UCB scale; if it ever is, batch inserts per transaction") — the trigger design note in Task 3 states the same non-contention property; no batching work is scoped here, matching the spec's own "if it ever is" framing.

**Discrepancies found between the spec and the actual repo (documented here rather than guessed past):**
1. Spec §5 says "Immutability is unchanged," implying `DO INSTEAD NOTHING` rules and the `REVOKE` already exist. Neither exists anywhere in this repo — confirmed by grepping `prisma/`, `src/` for `INSTEAD NOTHING`, `CREATE RULE`, `REVOKE`. The only related artifact is a `REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_app` that the tenant-isolation plan's Task 3 adds as part of `grantAppRole()` — written independently of this plan, before this plan existed, but it satisfies half of what §5 assumed was already there. This plan's Task 6 builds the other half (the rules) as new work, not a no-op.
2. `src/lib/session-context.ts`'s doc comment references `prisma/migrations/add_rls_policies.sql` as an existing file — it does not exist in this repo (same discrepancy the tenant-isolation plan found independently for the same phantom file). Not corrected here since it is outside this plan's file list; flagged for whoever next touches that file.
3. The current `detectAuditGaps` (pre-this-plan) has a real, verified bug: it computes gaps over `MIN`/`MAX` of a column that was, until Task 3, a single Postgres sequence shared across every tenant, so concurrent multi-tenant writes produce false-positive gaps. This was not a spec claim to correct — the spec simply says the function "is rewritten"; this plan documents *why* the rewrite (which Task 3's schema change alone accomplishes) is not cosmetic.
4. The attestation PDF's "signed" requirement (spec §5: "a signed attestation PDF for an examiner") is only partially built: Task 8 renders the PDF but does not cryptographically sign it, because the Ed25519 signing key spec §8 (licensing) introduces does not exist yet in this repo and that plan has not run. Flagged in Task 8's own text as a follow-up once the licensing plan lands, rather than inventing a key here.

**Placeholder scan:** no TBD/TODO. Task 3's migration SQL comment explaining the superuser-bypass boundary is a real design statement, not a placeholder — it says plainly what the rule does and does not defend against, and Task 9's tests exercise exactly that boundary.

**Type consistency:** `ChainableRow`/`LinkedRow`/`hashRow`/`verifyChain`/`GENESIS_HASH` (Task 2) are the exact names used in Task 5 (backfill), Task 7 (job), and Task 9 (integration test) — no renames across tasks. `AuditChainHead`/`AuditChainVerification` (Task 1) are the model names used verbatim in Tasks 3, 5, 7, 8, 9. `REQUIRED_OBJECTS.rules` (Task 6) is the field name `db-verify.ts` reads.

**Known risk to watch during execution:** the `ALTER TABLE ... DISABLE RULE / ENABLE RULE` pairing in Task 9's tests runs against `integrationOwner`, the same connection every other integration test file's fixtures also use via `withFixtures`. If a test in this file throws between the `DISABLE` and the `finally`'s `ENABLE` (a assertion failure inside the `try`, not just the query itself), the `finally` still runs — Vitest does not skip `finally` blocks on a failed `expect` inside `try`, since `expect` throws synchronously and the `finally` is not conditional on that throw's origin. Confirmed this is safe, but worth the explicit note since a leaked disabled rule would silently make every later test's writes bypass immutability for the rest of the suite run.
