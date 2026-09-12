/**
 * Assert every required database object exists.
 *
 * Usage: pnpm db:verify
 * Exits 1 and lists what is missing. Run it after db:bootstrap — in CI, and
 * against production as the last step of a release that touched the database
 * (see docs/ops/release-checklist.md).
 */
import { Client } from "pg";
import { REQUIRED_OBJECTS } from "../prisma/sql/manifest";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  const missing: string[] = [];

  try {
    const functions = await client.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'`,
    );
    const haveFunctions = new Set(functions.rows.map((r) => r.proname));
    for (const fn of REQUIRED_OBJECTS.functions) {
      if (!haveFunctions.has(fn)) missing.push(`function ${fn}`);
    }

    const views = await client.query<{ viewname: string }>(
      `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
    );
    const haveViews = new Set(views.rows.map((r) => r.viewname));
    for (const view of REQUIRED_OBJECTS.views) {
      if (!haveViews.has(view)) missing.push(`view ${view}`);
    }

    const triggers = await client.query<{ relname: string }>(
      `SELECT c.relname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = 'audit_trigger' AND NOT t.tgisinternal`,
    );
    const haveTriggers = new Set(triggers.rows.map((r) => r.relname));
    for (const table of REQUIRED_OBJECTS.triggers) {
      if (!haveTriggers.has(table)) missing.push(`audit_trigger on ${table}`);
    }
    const extra = [...haveTriggers].filter(
      (t) => !REQUIRED_OBJECTS.triggers.includes(t),
    );
    if (extra.length > 0) {
      console.warn(
        `note: audit_trigger also attached to ${extra.join(", ")} — ` +
          `writes to those tables must use withAuditedMutation`,
      );
    }

    const constraints = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint`,
    );
    const haveConstraints = new Set(constraints.rows.map((r) => r.conname));
    for (const c of REQUIRED_OBJECTS.constraints) {
      if (!haveConstraints.has(c)) missing.push(`constraint ${c}`);
    }
  } finally {
    await client.end();
  }

  if (missing.length > 0) {
    console.error("Missing required database objects:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error("\nRun: pnpm db:bootstrap");
    process.exit(1);
  }

  console.log("All required database objects present.");
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
