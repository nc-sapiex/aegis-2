#!/usr/bin/env node
/**
 * Generates the reference documentation in docs/reference/ from the source of
 * truth: prisma/schema.prisma and the src/ tree.
 *
 * These documents are derived, never hand-edited — a 75-model data dictionary
 * maintained by hand is wrong within a week. Run `pnpm docs:reference` after
 * changing the schema, a route, a server action, or a job.
 *
 * Usage: node scripts/generate-reference-docs.mjs [--check]
 *   --check  exit 1 if the committed docs differ from freshly generated output
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const CHECK = process.argv.includes("--check");

// ─── helpers ────────────────────────────────────────────────────────────────
function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const esc = (s) => String(s).replace(/\|/g, "\\|");

/** Extract the argument of `marker`, honouring nested parentheses. */
function balanced(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  let depth = 0;
  for (let j = i + marker.length - 1; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")") {
      depth--;
      if (depth === 0) return src.slice(i + marker.length, j);
    }
  }
  return "";
}

function gitMeta() {
  try {
    return {
      sha: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
      branch: execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
      }).trim(),
    };
  } catch {
    return { sha: "unknown", branch: "unknown" };
  }
}
const META = gitMeta();

function header(title, blurb) {
  return `# ${title}

> **Generated file — do not edit by hand.**
> Produced by \`scripts/generate-reference-docs.mjs\` from \`prisma/schema.prisma\`
> and the \`src/\` tree. Regenerate with \`pnpm docs:reference\`.
>
> Source commit: \`${META.sha}\` (${META.branch})

${blurb}
`;
}

// ─── 1. Parse schema.prisma ─────────────────────────────────────────────────
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");

function parseSchema(src) {
  const models = [];
  const enums = [];
  const lines = src.split("\n");
  let cur = null,
    kind = null,
    pending = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    const mm = t.match(/^model\s+(\w+)\s*\{/);
    const em = t.match(/^enum\s+(\w+)\s*\{/);

    if (mm) {
      cur = { name: mm[1], doc: pending.join(" "), fields: [] };
      kind = "model";
      pending = [];
      continue;
    }
    if (em) {
      cur = { name: em[1], doc: pending.join(" "), values: [] };
      kind = "enum";
      pending = [];
      continue;
    }

    if (t === "}" && cur) {
      (kind === "model" ? models : enums).push(cur);
      cur = null;
      kind = null;
      pending = [];
      continue;
    }

    if (t.startsWith("//")) {
      pending.push(t.replace(/^\/\/\s?/, ""));
      continue;
    }
    if (!t) {
      pending = [];
      continue;
    }

    if (!cur) continue;

    if (kind === "enum") {
      if (/^\w+$/.test(t)) cur.values.push(t);
      pending = [];
      continue;
    }

    // Block-level attribute (@@index, @@unique, @@map ...)
    if (t.startsWith("@@")) {
      (cur.blockAttrs ||= []).push(t);
      pending = [];
      continue;
    }

    // field:  name  Type[]?  @attrs
    const fm = t.match(/^(\w+)\s+(\S+?)(\[\])?(\?)?\s*(@.*)?$/);
    if (fm) {
      const [, name, type, list, opt, attrs = ""] = fm;
      const rel = attrs.match(/@relation\(([^)]*)\)/);
      cur.fields.push({
        name,
        type,
        list: !!list,
        optional: !!opt,
        attrs,
        isId: /@id\b/.test(attrs),
        unique: /@unique\b/.test(attrs),
        def: balanced(attrs, "@default("),
        dbType: (attrs.match(/@db\.(\w+)/) || [])[1] || "",
        relation: rel ? rel[1] : null,
        doc: pending.join(" "),
      });
    }
    pending = [];
  }
  return { models, enums };
}

const { models, enums } = parseSchema(schema);
const modelNames = new Set(models.map((m) => m.name));

// ─── 2. Routes ──────────────────────────────────────────────────────────────
const appDir = join(ROOT, "src/app");
const routeOf = (file, leaf) =>
  "/" +
  relative(appDir, file)
    .replace(new RegExp(`${leaf}$`), "")
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg))
    .join("/");

const pages = walk(appDir, (p) => p.endsWith("/page.tsx"))
  .map((f) => ({
    route: routeOf(f, "page.tsx") || "/",
    file: relative(ROOT, f),
  }))
  .sort((a, b) => a.route.localeCompare(b.route));

const apis = walk(appDir, (p) => p.endsWith("/route.ts"))
  .map((f) => {
    const src = readFileSync(f, "utf8");
    const methods = [
      ...src.matchAll(
        /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
      ),
    ].map((m) => m[1]);
    const dynamic =
      /export\s+const\s+dynamic\s*=\s*["']([^"']+)["']/.exec(src)?.[1] || "";
    const doc = (src.match(/\/\*\*([\s\S]*?)\*\//) || [])[1] || "";
    const summary =
      doc
        .split("\n")
        .map((l) => l.replace(/^\s*\*\s?/, "").trim())
        .filter(
          (l) =>
            l &&
            !l.startsWith("@") &&
            !/^(GET|POST|PUT|PATCH|DELETE)\s/.test(l),
        )[0] || "";
    return {
      route: routeOf(f, "route.ts"),
      methods,
      dynamic,
      summary,
      file: relative(ROOT, f),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

// ─── 3. Server actions ──────────────────────────────────────────────────────
const actionFiles = walk(
  join(ROOT, "src/actions"),
  (p) => p.endsWith(".ts") && !p.includes("__tests__"),
);
const actions = actionFiles
  .map((f) => {
    const src = readFileSync(f, "utf8");
    const rel = relative(ROOT, f);
    const isServer = /^\s*["']use server["']/m.test(src);
    const fns = [
      ...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g),
    ].map((m) => m[1]);
    const audited = /withAuditedMutation\s*\(/.test(src);
    const perms = [
      ...new Set(
        [...src.matchAll(/["'`]([a-z_]+:[a-z_]+)["'`]/g)].map((m) => m[1]),
      ),
    ];
    const tables = [
      ...new Set(
        [...src.matchAll(/\b(?:prisma|tx|db)\.(\w+)\./g)]
          .map((m) => m[1][0].toUpperCase() + m[1].slice(1))
          .filter((n) => modelNames.has(n)),
      ),
    ].sort();
    const seg = rel.split("/")[2] || "";
    const domain = seg.endsWith(".ts") ? "(root)" : seg || "(root)";
    return { file: rel, domain, isServer, fns, audited, perms, tables };
  })
  .filter((a) => a.fns.length);

// ─── 4. Jobs ────────────────────────────────────────────────────────────────
const jobs = walk(
  join(ROOT, "src/jobs"),
  (p) =>
    p.endsWith(".ts") &&
    !p.includes("__tests__") &&
    !p.includes("__integration__"),
)
  .map((f) => {
    const src = readFileSync(f, "utf8");
    const tables = [
      ...new Set(
        [...src.matchAll(/\b(?:prisma|tx|db)\.(\w+)\./g)]
          .map((m) => m[1][0].toUpperCase() + m[1].slice(1))
          .filter((n) => modelNames.has(n)),
      ),
    ].sort();
    return {
      file: relative(ROOT, f),
      name: f.split("/").pop().replace(/\.ts$/, ""),
      tables,
      audited: /withAuditedMutation\s*\(/.test(src),
    };
  })
  .filter((j) => j.name !== "index");

// ─── 5. Emit: data dictionary ───────────────────────────────────────────────
function dataDictionary() {
  let out = header(
    "Data Dictionary",
    `Every table AEGIS maintains, with its columns, types and relationships.
**${models.length} models** and **${enums.length} enumerations**.

Conventions used throughout the schema:

- Primary keys are UUIDs generated by PostgreSQL (\`gen_random_uuid()\`).
- \`tenantId\` is the tenant discriminator. Tenant isolation is enforced in
  application code, not by row-level security, so **every query against a table
  carrying \`tenantId\` must scope by it**.
- \`Cascade\` on the tenant relation means deleting a tenant removes its rows.`,
  );

  out += `\n## Contents\n\n`;
  out += models
    .map((m) => `- [${m.name}](#${m.name.toLowerCase()})`)
    .join("\n");
  out += `\n- [Enumerations](#enumerations)\n\n---\n`;

  for (const m of models) {
    out += `\n## ${m.name}\n\n`;
    if (m.doc) out += `${m.doc}\n\n`;
    const tenantScoped = m.fields.some((f) => f.name === "tenantId");
    out += `*Tenant-scoped:* ${tenantScoped ? "**yes** — always filter by `tenantId`" : "no"}\n\n`;
    out += `| Column | Type | Null | Key | Default | Notes |\n|---|---|---|---|---|---|\n`;
    for (const f of m.fields) {
      const isRel = !!f.relation || (modelNames.has(f.type) && !f.dbType);
      const type =
        f.type +
        (f.list ? "[]" : "") +
        (f.dbType ? ` \`@db.${f.dbType}\`` : "");
      const key = f.isId ? "PK" : f.unique ? "UQ" : isRel ? "FK→" + f.type : "";
      const notes = [f.doc, isRel && f.relation ? "relation" : ""]
        .filter(Boolean)
        .join(" ");
      out += `| \`${f.name}\` | ${esc(type)} | ${f.optional ? "yes" : "no"} | ${key} | ${f.def ? `\`${esc(f.def)}\`` : ""} | ${esc(notes)} |\n`;
    }
    if (m.blockAttrs?.length) {
      out += `\nIndexes and constraints:\n\n`;
      out += m.blockAttrs.map((a) => `- \`${a}\``).join("\n") + "\n";
    }
  }

  out += `\n---\n\n## Enumerations\n\n`;
  for (const e of enums) {
    out += `### ${e.name}\n\n`;
    if (e.doc) out += `${e.doc}\n\n`;
    out += e.values.map((v) => `\`${v}\``).join(" · ") + "\n\n";
  }
  return out;
}

// ─── 6. Emit: routes ────────────────────────────────────────────────────────
function routeList() {
  let out = header(
    "Route List",
    `Every addressable path in the application: **${pages.length} pages** and
**${apis.length} HTTP endpoints**.

Pages are React Server Components under the Next.js App Router. Route groups in
parentheses — \`(dashboard)\`, \`(auth)\` — organise files without appearing in
the URL, so they are stripped here.`,
  );

  out += `\n## Pages\n\n| Route | Source |\n|---|---|\n`;
  for (const p of pages) out += `| \`${p.route}\` | \`${p.file}\` |\n`;

  out += `\n## HTTP endpoints\n\n| Endpoint | Methods | Rendering | Purpose |\n|---|---|---|---|\n`;
  for (const a of apis) {
    out += `| \`${a.route}\` | ${a.methods.join(", ") || "—"} | ${a.dynamic || "default"} | ${esc(a.summary)} |\n`;
  }
  return out;
}

// ─── 7. Emit: API reference ─────────────────────────────────────────────────
function apiReference() {
  const byDomain = {};
  for (const a of actions) (byDomain[a.domain] ||= []).push(a);

  let out = header(
    "API Reference",
    `AEGIS has two callable surfaces.

**HTTP endpoints** (${apis.length}) are conventional routes under \`/api\`, used
for file downloads, streamed exports and health checks.

**Server actions** (${actions.reduce((n, a) => n + a.fns.length, 0)} exported
functions across ${actions.length} modules) are the primary surface. They are
invoked directly from React components rather than over HTTP, so they have no
URL — the function signature is the contract. Every one runs on the server and
derives the caller's tenant from the session.

The *Audited* column marks modules routing writes through
\`withAuditedMutation\`, which opens the transaction and sets the session context
the database audit trigger reads.`,
  );

  out += `\n## HTTP endpoints\n\n`;
  for (const a of apis) {
    out += `### \`${a.methods.join(" / ") || "—"} ${a.route}\`\n\n`;
    if (a.summary) out += `${a.summary}\n\n`;
    out += `- Source: \`${a.file}\`\n- Rendering: \`${a.dynamic || "default"}\`\n\n`;
  }

  out += `## Server actions\n\n`;
  for (const domain of Object.keys(byDomain).sort()) {
    out += `### ${domain}\n\n| Module | Audited | Exported functions | Tables touched |\n|---|---|---|---|\n`;
    for (const a of byDomain[domain].sort((x, y) =>
      x.file.localeCompare(y.file),
    )) {
      out += `| \`${a.file.replace("src/actions/", "")}\` | ${a.audited ? "yes" : "—"} | ${a.fns.map((f) => `\`${f}\``).join(", ")} | ${a.tables.join(", ") || "—"} |\n`;
    }
    out += "\n";
  }
  return out;
}

// ─── 8. Emit: data flows ────────────────────────────────────────────────────
function dataFlows() {
  const tableWriters = {};
  for (const a of actions)
    for (const t of a.tables) (tableWriters[t] ||= new Set()).add(a.domain);
  for (const j of jobs)
    for (const t of j.tables) (tableWriters[t] ||= new Set()).add("jobs");

  let out = header(
    "Data Flows",
    `Which processes read and write which tables.

Derived by static analysis: each module is scanned for \`prisma.<model>\`,
\`tx.<model>\` and \`db.<model>\` accesses. This captures direct database access.
A module reaching a table indirectly — through a helper in \`src/data-access/\` —
is **not** shown here, so treat this as a map of direct access, not a complete
reachability graph.`,
  );

  const domains = [...new Set(actions.map((a) => a.domain))].sort();

  out += `\n## Process → table map\n\n`;
  out += `| Domain | Modules | Tables touched directly |\n|---|---|---|\n`;
  for (const d of domains) {
    const inDomain = actions.filter((a) => a.domain === d);
    const tables = [...new Set(inDomain.flatMap((a) => a.tables))].sort();
    out += `| \`${d}\` | ${inDomain.length} | ${tables.map((t) => `\`${t}\``).join(", ") || "—"} |\n`;
  }

  out += `\n## Background jobs\n\n| Job | Audited | Tables touched directly |\n|---|---|---|\n`;
  for (const j of jobs.sort((a, b) => a.name.localeCompare(b.name))) {
    out += `| \`${j.name}\` | ${j.audited ? "yes" : "—"} | ${j.tables.map((t) => `\`${t}\``).join(", ") || "—"} |\n`;
  }

  // Most-contended tables
  const ranked = Object.entries(tableWriters)
    .map(([t, s]) => [t, [...s].sort()])
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15);
  out += `\n## Most widely accessed tables\n\nTables reached from the greatest number of domains — the ones where a schema change carries the widest blast radius.\n\n`;
  out += `| Table | Domains | Reached from |\n|---|---|---|\n`;
  for (const [t, ds] of ranked)
    out += `| \`${t}\` | ${ds.length} | ${ds.map((d) => `\`${d}\``).join(", ")} |\n`;

  // Domain → hub table graph (top hubs only — full map is the table above)
  const hubs = ranked.filter(([, ds]) => ds.length >= 3).slice(0, 6);
  if (hubs.length > 0) {
    out += `\n### Domain access graph\n\nDomains that reach the most-shared tables. Edges mean direct Prisma access in that domain's modules; not every path a page can take.\n\n`;
    out += "```mermaid\nflowchart LR\n";
    out += "    subgraph hubs [Shared tables]\n";
    for (const [t] of hubs) {
      const id = `T_${t.replace(/[^A-Za-z0-9]/g, "_")}`;
      out += `        ${id}["${t}"]\n`;
    }
    out += "    end\n";
    const seenDomain = new Set();
    for (const [t, ds] of hubs) {
      const tid = `T_${t.replace(/[^A-Za-z0-9]/g, "_")}`;
      for (const d of ds) {
        const did = `D_${d.replace(/[^A-Za-z0-9]/g, "_")}`;
        if (!seenDomain.has(d)) {
          out += `    ${did}["${d}"]\n`;
          seenDomain.add(d);
        }
        out += `    ${did} --> ${tid}\n`;
      }
    }
    out += "```\n";
  }

  // Observation lifecycle diagram
  out += `\n## The observation lifecycle\n\nThe central workflow, and the tables each transition writes.\n\n`;
  out += "```mermaid\nstateDiagram-v2\n";
  out += "    [*] --> DRAFT: auditor creates\n";
  out += "    DRAFT --> SUBMITTED: submit for review\n";
  out += "    SUBMITTED --> REVIEWED: manager reviews\n";
  out += "    REVIEWED --> ISSUED: issue to branch\n";
  out += "    ISSUED --> RESPONSE: branch responds\n";
  out += "    RESPONSE --> COMPLIANCE: compliance tracking\n";
  out += "    COMPLIANCE --> CLOSED: close (CAE for HIGH/CRITICAL)\n";
  out += "    CLOSED --> [*]\n";
  out += "```\n\n";
  out += `Every transition writes \`Observation\`, appends to \`ObservationTimeline\`, and — because both carry the audit trigger — inserts a row into \`AuditLog\`.\n`;

  // Audited write path
  out += `\n## The audited write path\n\nHow a mutation reaches the audit log.\n\n`;
  out += "```mermaid\nflowchart TD\n";
  out +=
    '    A["Server action or job"] --> B["withAuditedMutation(actor, actionType)"]\n';
  out += '    B --> C["BEGIN transaction"]\n';
  out += "    C --> D[\"set_config('app.current_*') session GUCs\"]\n";
  out += '    D --> E["Business mutation on an audited table"]\n';
  out += '    E --> F["AFTER-row trigger: audit_trigger_function()"]\n';
  out += '    F --> G["INSERT into AuditLog"]\n';
  out += '    G --> H["COMMIT"]\n';
  out += "```\n\n";
  out += `The trigger reads the tenant, user, action and justification from PostgreSQL session settings that \`withAuditedMutation\` sets inside the same transaction. A mutation made outside that wrapper writes an audit row with no attribution — which is why the discipline test in \`src/data-access/__tests__/\` fails the build when a new unaudited write appears.\n`;

  return out;
}

// ─── write ──────────────────────────────────────────────────────────────────
const outputs = {
  "docs/reference/data-dictionary.md": dataDictionary(),
  "docs/reference/routes.md": routeList(),
  "docs/reference/api-reference.md": apiReference(),
  "docs/reference/data-flows.md": dataFlows(),
};

let drift = false;
for (const [rel, content] of Object.entries(outputs)) {
  const p = join(ROOT, rel);
  const prev = existsSync(p) ? readFileSync(p, "utf8") : null;
  const norm = (s) => s.replace(/^> Source commit: .*$/m, "");
  if (prev !== null && norm(prev) !== norm(content)) drift = true;
  if (prev === null) drift = true;
  if (!CHECK) {
    writeFileSync(p, content);
    console.log(`wrote ${rel} (${content.split("\n").length} lines)`);
  }
}

if (CHECK) {
  if (drift) {
    console.error("Reference docs are stale. Run: pnpm docs:reference");
    process.exit(1);
  }
  console.log("Reference docs are up to date.");
}
