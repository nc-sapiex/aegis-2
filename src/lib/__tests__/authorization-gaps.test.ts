import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const PAGE_ROOT = "src/app/(dashboard)";
const ACTION_ROOT = "src/actions";
const PAGE_GUARD_CALLS = [
  "requirePermission(",
  "requireAnyPermission(",
  "requireOnboardingPermission(",
];
const ACTION_EXCLUDED_FILES = new Set(["schemas.ts"]);

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
      return !PAGE_GUARD_CALLS.some((call) => source.includes(call));
    });

    expect(
      unguarded,
      `Dashboard pages missing require* guard:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("every server action file checks hasPermission", () => {
    const unguarded = actionFiles.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf-8");
      if (!source.includes('"use server"')) return false;
      return !source.includes("hasPermission(");
    });

    expect(
      unguarded,
      `Action files missing hasPermission gate:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });
});
