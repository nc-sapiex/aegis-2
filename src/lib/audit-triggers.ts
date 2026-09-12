/**
 * The tables carrying `audit_trigger`, and the sanctioned way to suspend it.
 *
 * Kept free of `server-only` so seed scripts (which run under tsx, outside the
 * Next.js runtime) can import it.
 */

/**
 * Tables with an AFTER INSERT/UPDATE/DELETE `audit_trigger`.
 *
 * Source of truth: `prisma/sql/020_attach_audit_triggers.sql`, which attaches
 * the trigger to exactly these tables on every database. Keep this list, that
 * file, and `AUDIT_TRIGGER_TABLES` in `prisma/sql/manifest.ts` in step — the
 * discipline test reads this one, `db:bootstrap` applies that one, and
 * `db:verify` checks the third.
 */
export const AUDITED_TABLES = [
  "AuditArea",
  "AuditEngagement",
  "AuditPlan",
  "AuditeeResponse",
  "Branch",
  "ComplianceRequirement",
  "EmailLog",
  "Evidence",
  "NotificationQueue",
  "Observation",
  "ObservationTimeline",
  "Tenant",
  "User",
  "UserBranchAssignment",
  // Historically attached only by add_notification_tables.sql; 020 now
  // attaches them everywhere, so the discipline test and the database agree.
  "NotificationPreference",
  "BoardReport",
  // RBIA/GRC scoring surface — the regulated change-history an RBI examiner
  // expects. Every write path to these already sets session context, so the
  // trigger fires cleanly. See audit-coverage.test.ts for the coverage guard.
  "ActionPoint",
  "RamAssessment",
  "RamAssessmentScore",
  "BranchRbiaScore",
  "AuditExaminationResponse",
  // Remaining scoring tables. Their previously un-contexted write paths now run
  // through withAuditedMutation, so the trigger fires cleanly on every write.
  "ExaminationResponse",
  "AccountExamResponse",
  "LoanAccount",
] as const;

export type AuditedTable = (typeof AUDITED_TABLES)[number];

interface UnsafeRawExecutor {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

/**
 * Which audited tables actually carry the trigger right now.
 *
 * A database built by `prisma db push` alone has none: the triggers come from
 * `prisma/sql/020_attach_audit_triggers.sql`, applied by `pnpm db:bootstrap`.
 * Detaching what is not attached would fail, so ask first.
 */
async function attachedTables(db: UnsafeRawExecutor): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'audit_trigger' AND NOT t.tgisinternal`,
  );
  // Deliberately NOT filtered through AUDITED_TABLES. A database may carry
  // audit_trigger on a table this build does not know about — an older schema,
  // or a hand-applied legacy file. Detach whatever is actually there, so the
  // `finally` restores exactly what it suspended.
  return rows.map((r) => r.relname);
}

/**
 * Run `fn` with the audit triggers suspended, then restore them.
 *
 * For seeding only. Seeded rows carry no audit history by design: fabricating
 * a trail for demo data would be dishonest in a product sold on audit
 * integrity, and the seed has no Actor to attribute rows to.
 *
 * Uses ALTER TABLE ... DISABLE TRIGGER, which the table owner may run.
 * `session_replication_role`, which scripts/seed-full-audit-lifecycle.ts once
 * set, requires superuser; dropping the trigger loses it outright if the
 * process dies mid-seed; this restores in a `finally`.
 *
 * Table names are interpolated into DDL, so they come from pg_catalog via
 * `attachedTables` — never from caller input.
 *
 * Not re-entrant: `attachedTables` reads pg_trigger without checking
 * `tgenabled`, so a nested call would re-enable on its way out while the outer
 * block is still writing. Callers that may nest need their own depth guard.
 */
export async function withTriggersDetached<T>(
  db: UnsafeRawExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  const tables = await attachedTables(db);

  // Track what was actually detached, and cover the detach loop itself: a
  // failure partway through (lock timeout, permissions) would otherwise leave
  // the earlier tables silently unaudited for good.
  const detached: string[] = [];

  try {
    for (const table of tables) {
      await db.$executeRawUnsafe(
        `ALTER TABLE "${table}" DISABLE TRIGGER audit_trigger`,
      );
      detached.push(table);
    }

    return await fn();
  } finally {
    let restoreError: unknown;
    for (const table of detached) {
      try {
        await db.$executeRawUnsafe(
          `ALTER TABLE "${table}" ENABLE TRIGGER audit_trigger`,
        );
      } catch (err) {
        // Keep restoring the rest: a table left unaudited is worse than a
        // lost error. Re-thrown once the loop finishes.
        restoreError ??= err;
      }
    }
    if (restoreError) throw restoreError;
  }
}
