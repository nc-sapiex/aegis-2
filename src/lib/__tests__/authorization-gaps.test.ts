import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const PAGE_ROOT = "src/app/(dashboard)";
const ACTION_ROOT = "src/actions";
const PAGE_DEFAULT_EXPORT = /export\s+default\s+async\s+function(?:\s+\w+)?\s*\(/g;
const PAGE_GUARD_CALLS = [
  "requirePermission(",
  "requireAnyPermission(",
  "requireOnboardingPermission(",
];
const ACTION_GUARD_PATTERN =
  /(has[A-Za-z]*Permission\(|require[A-Za-z]+Permission\()/;
const ACTION_EXCLUDED_FILES = new Set(["schemas.ts"]);
const ACTION_ALLOWLIST = new Set([
  "src/actions/compliance/run-escalation-job.ts:runEscalationJobInternal",
  "src/actions/user-invitations.ts:acceptInvitation",
]);

function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((entry) => {
    const rel = join(dir, entry);
    const abs = join(process.cwd(), rel);

    if (statSync(abs).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__") return [];
      return walk(rel);
    }

    return [rel];
  });
}

function exportedServerActions(source: string): { name: string; body: string }[] {
  const actions: { name: string; body: string }[] = [];
  const matches = [
    ...source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g),
    ...source.matchAll(/export\s+const\s+(\w+)\s*=\s*async\s*\(/g),
  ].sort((a, b) => a.index - b.index);

  for (const [index, match] of matches.entries()) {
    const nextMatch = matches[index + 1];
    actions.push({
      name: match[1],
      body: source.slice(match.index, nextMatch?.index ?? source.length),
    });
  }

  return actions;
}

function defaultExportPageBody(source: string): string | null {
  const match = PAGE_DEFAULT_EXPORT.exec(source);
  PAGE_DEFAULT_EXPORT.lastIndex = 0;
  if (!match?.index && match?.index !== 0) return null;

  const nextExport = source.indexOf("\nexport ", match.index + 1);
  return source.slice(match.index, nextExport === -1 ? source.length : nextExport);
}

describe("authorization gaps", () => {
  const dashboardPages = walk(PAGE_ROOT).filter((file) => file.endsWith("/page.tsx"));
  const actionFiles = walk(ACTION_ROOT).filter((file) => {
    if (!file.endsWith(".ts")) return false;
    if (ACTION_EXCLUDED_FILES.has(file.split("/").at(-1) ?? "")) return false;
    return true;
  });

  it("finds dashboard pages and action files to analyze", () => {
    expect(dashboardPages.length).toBeGreaterThan(10);
    expect(actionFiles.length).toBeGreaterThan(10);
  });

  it("every (dashboard) page.tsx calls a page guard", () => {
    const unguarded = dashboardPages.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf-8");
      const pageBody = defaultExportPageBody(source);
      return (
        pageBody === null ||
        !PAGE_GUARD_CALLS.some((call) => pageBody.includes(call))
      );
    });

    expect(
      unguarded,
      `Dashboard pages missing require* guard:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("every server action file checks hasPermission", () => {
    const unguarded = actionFiles.flatMap((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf-8");
      if (!source.includes('"use server"')) return [];

      return exportedServerActions(source)
        .filter((action) => {
          const key = `${file}:${action.name}`;
          if (ACTION_ALLOWLIST.has(key)) return false;
          return !ACTION_GUARD_PATTERN.test(action.body);
        })
        .map((action) => `${file}:${action.name}`);
    });

    expect(
      unguarded,
      `Server actions missing hasPermission gate:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });
});
