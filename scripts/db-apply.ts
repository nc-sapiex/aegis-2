/**
 * Apply one or more hand-run SQL files, in the order given.
 *
 * Usage: pnpm db:apply prisma/migrations/20260904_f07_f15_schema_additions.sql
 *
 * These files are deliberately *not* in the manifest that `db:bootstrap`
 * applies: they are schema migrations an operator runs by hand against
 * production, once, in a known order. This script exists so CI can rehearse
 * that same run against a `db:push`-built database, which both proves the SQL
 * parses and proves it is idempotent — push has already created everything the
 * file guards against.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const paths = process.argv.slice(2);
  if (paths.length === 0)
    throw new Error("at least one SQL file path is required");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const path of paths) {
      const sql = readFileSync(resolve(process.cwd(), path), "utf-8");
      process.stdout.write(`applying ${path} ... `);
      await client.query(sql);
      process.stdout.write("ok\n");
    }
  } finally {
    await client.end();
  }

  console.log(`\n${paths.length} SQL file(s) applied.`);
}

main().catch((error) => {
  console.error("\napply failed:", error);
  process.exit(1);
});
