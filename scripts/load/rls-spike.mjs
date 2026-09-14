// scripts/load/rls-spike.mjs
// Usage: SESSION_COOKIE='better-auth.session_token=...' ENGAGEMENT_ID=<uuid> node scripts/load/rls-spike.mjs
// Runs before every release too (spec §10 "Load").
import autocannon from "autocannon";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const cookie = process.env.SESSION_COOKIE;
const engagementId = process.env.ENGAGEMENT_ID;
if (!cookie || !engagementId) {
  console.error("SESSION_COOKIE and ENGAGEMENT_ID are required");
  process.exit(2);
}

const targets = [
  { name: "dashboard", url: `${base}/dashboard` },
  { name: "rbia-tree", url: `${base}/audit-execution/${engagementId}/rbia` },
];

async function run(target) {
  const result = await autocannon({
    url: target.url,
    connections: 20,
    duration: 30,
    headers: { cookie },
  });
  const p95 = result.latency.p97_5 ?? result.latency.p99;
  return {
    name: target.name,
    requests: result.requests.total,
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
    p50: result.latency.p50,
    p95: result.latency.p95 ?? p95,
    p99: result.latency.p99,
  };
}

const mode = "rls";
const rows = [];
for (const t of targets) rows.push(await run(t));
console.log(`\nmode=${mode} pool=${process.env.PG_POOL_MAX ?? 25}`);
console.table(rows);
if (rows.some((r) => r.non2xx > 0 || r.errors > 0)) {
  console.error(
    "Non-2xx or transport errors present; check server logs for P2028.",
  );
  process.exit(1);
}
