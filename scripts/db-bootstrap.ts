/**
 * Apply every non-Prisma database object, in manifest order.
 *
 * Usage: pnpm db:bootstrap
 * Requires DATABASE_OWNER_URL (or DATABASE_URL as a fallback) and
 * DATABASE_APP_PASSWORD. Safe to re-run — every file in the manifest is
 * idempotent, which is a precondition for being in the manifest at all, and
 * role creation/grants are idempotent too.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { PgBoss } from "pg-boss";
import { SQL_MANIFEST } from "../prisma/sql/manifest";

async function main() {
  const connectionString =
    process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");
  const appPassword = process.env.DATABASE_APP_PASSWORD;
  if (!appPassword)
    throw new Error(
      "DATABASE_APP_PASSWORD is required (password for the aegis_app role)",
    );
  const systemPassword = process.env.DATABASE_SYSTEM_PASSWORD;
  if (!systemPassword)
    throw new Error(
      "DATABASE_SYSTEM_PASSWORD is required (password for the aegis_system role)",
    );

  const client = new Client({ connectionString });
  // Surface RAISE WARNING from the manifest (e.g. 010's tamper warning);
  // pg drops notices unless someone listens.
  client.on("notice", (n) => console.warn(`${n.severity}: ${n.message}`));
  await client.connect();
  try {
    await ensureAppRole(client, appPassword);
    await ensureSystemRole(client, systemPassword);
    for (const relativePath of SQL_MANIFEST) {
      const sql = readFileSync(join(process.cwd(), relativePath), "utf8");
      console.log(`applying ${relativePath}`);
      await client.query(sql);
    }
    await grantAppRole(client);
    await grantSystemRole(client);
    await ensureJobQueueSchema(connectionString);
    await grantJobQueueSchema(client);
  } finally {
    await client.end();
  }

  console.log(`\n${SQL_MANIFEST.length} SQL files applied.`);
}

/** Idempotent. Password is quoted with format('%L'); never interpolate it. */
async function ensureAppRole(client: Client, password: string) {
  const exists = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app'`,
  );
  const verb = exists.rows.length === 0 ? "CREATE" : "ALTER";
  const { rows } = await client.query<{ stmt: string }>(
    `SELECT format('%s ROLE aegis_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text, $2::text) AS stmt`,
    [verb, password],
  );
  await client.query(rows[0].stmt);
}

/** Runs after the manifest so objects created there are covered too. */
async function grantAppRole(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO aegis_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aegis_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aegis_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aegis_app;
    REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_app;
  `);
}

/**
 * aegis_system: BYPASSRLS, otherwise identical grants to aegis_app. Not a
 * second owner role — it cannot CREATE/ALTER/DROP and has no DDL rights, it
 * only skips the RLS policy check. Used solely by src/lib/prisma.ts's
 * prismaSystem client, for the narrow set of reads that must cross tenants
 * or run pre-auth (see prismaSystem's doc comment).
 */
async function ensureSystemRole(client: Client, password: string) {
  const exists = await client.query(
    `SELECT 1 FROM pg_roles WHERE rolname = 'aegis_system'`,
  );
  const verb = exists.rows.length === 0 ? "CREATE" : "ALTER";
  const { rows } = await client.query<{ stmt: string }>(
    `SELECT format('%s ROLE aegis_system LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text, $2::text) AS stmt`,
    [verb, password],
  );
  await client.query(rows[0].stmt);
}

/** Runs after the manifest so objects created there are covered too. */
async function grantSystemRole(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO aegis_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aegis_system;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aegis_system;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aegis_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aegis_system;
    REVOKE UPDATE, DELETE ON "AuditLog" FROM aegis_system;
  `);
}

/**
 * pg-boss (src/lib/job-queue.ts) runs as aegis_app, which has no CREATE
 * privilege — it can never install or migrate its own `pgboss` schema.
 * Running pg-boss's own start()/stop() once here, as the owner, installs
 * or migrates that schema so the app's own start() at runtime finds it
 * already at the expected version and only ever does read-only checks
 * (contractor.js: isInstalled + schemaVersion, no DDL) before granting
 * aegis_app the DML rights it needs on the data. A pg-boss version bump
 * needs a `db:bootstrap` re-run before deploy, same as any other schema
 * change.
 */
async function ensureJobQueueSchema(connectionString: string) {
  const boss = new PgBoss({ connectionString });
  await boss.start();
  await boss.stop();
}

/** Runs after ensureJobQueueSchema so the pgboss schema exists to grant on. */
async function grantJobQueueSchema(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA pgboss TO aegis_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO aegis_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO aegis_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO aegis_app;
  `);
}

main().catch((error) => {
  console.error("\nbootstrap failed:", error);
  process.exit(1);
});
