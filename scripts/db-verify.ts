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
  const connectionString =
    process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");

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

    // A DISABLEd rule counts as missing: disabling one is how a superuser
    // edits the audit trail.
    const rules = await client.query<{ rulename: string }>(
      `SELECT r.rulename FROM pg_rewrite r
         JOIN pg_class c ON c.oid = r.ev_class
        WHERE c.relname = 'AuditLog' AND r.ev_enabled <> 'D'`,
    );
    const haveRules = new Set(rules.rows.map((r) => r.rulename));
    for (const rule of REQUIRED_OBJECTS.rules) {
      if (!haveRules.has(rule))
        missing.push(`enabled rule ${rule} on AuditLog`);
    }

    const role = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'aegis_app'`,
    );
    if (role.rows.length === 0) missing.push("role aegis_app");
    else if (role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      missing.push("role aegis_app must not be SUPERUSER or BYPASSRLS");
    }

    const systemRole = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'aegis_system'`,
    );
    if (systemRole.rows.length === 0) missing.push("role aegis_system");
    else if (systemRole.rows[0].rolsuper) {
      missing.push("role aegis_system must not be SUPERUSER");
    } else if (!systemRole.rows[0].rolbypassrls) {
      missing.push("role aegis_system must be BYPASSRLS");
    }

    const auditWriters = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles
        WHERE rolname IN ('aegis_app', 'aegis_system')
          AND (has_table_privilege(rolname, '"AuditLog"', 'UPDATE')
            OR has_table_privilege(rolname, '"AuditLog"', 'DELETE'))`,
    );
    for (const { rolname } of auditWriters.rows) {
      missing.push(
        `role ${rolname} must not have UPDATE or DELETE on AuditLog`,
      );
    }

    const policies = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'`,
    );
    const havePolicies = new Set(policies.rows.map((r) => r.tablename));
    for (const table of REQUIRED_OBJECTS.policies) {
      if (!havePolicies.has(table))
        missing.push(`policy tenant_isolation on ${table}`);
    }
    const forced = await client.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity`,
    );
    const haveForced = new Set(forced.rows.map((r) => r.relname));
    for (const table of REQUIRED_OBJECTS.policies) {
      if (!haveForced.has(table))
        missing.push(`FORCE ROW LEVEL SECURITY on ${table}`);
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
