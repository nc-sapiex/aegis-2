#!/usr/bin/env node
// Driver for aegis-2: drives the running Next.js app with Playwright
// (already an installed project dependency — no chromium-cli in this env).
//
// Usage (app must already be running at BASE_URL, see SKILL.md):
//   node .claude/skills/run-aegis-2/driver.mjs login-screenshot [outPath]
//   node .claude/skills/run-aegis-2/driver.mjs goto <path> [outPath]
//
// Env:
//   BASE_URL        default http://localhost:3000
//   TEST_EMAIL      default rajesh.deshmukh@apexbank.example (seeded by `pnpm db:seed`)
//   TEST_PASSWORD   default TestPassword123! (the fixed password `pnpm db:seed` sets for every seeded user)

import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TEST_EMAIL = process.env.TEST_EMAIL || "rajesh.deshmukh@apexbank.example";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "TestPassword123!";

async function login(page) {
  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page
    .waitForURL(/\/(dashboard)?(?!login)/, { timeout: 15000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  try {
    if (cmd === "login-screenshot") {
      await login(page);
      const out = arg1 || "/tmp/aegis-pg-skill/dashboard.png";
      await page.screenshot({ path: out, fullPage: true });
      console.log(`OK login-screenshot -> ${out} (url: ${page.url()})`);
    } else if (cmd === "goto") {
      await login(page);
      await page.goto(BASE_URL + arg1, { waitUntil: "networkidle" });
      const out = arg2 || "/tmp/aegis-pg-skill/page.png";
      await page.screenshot({ path: out, fullPage: true });
      console.log(`OK goto ${arg1} -> ${out} (url: ${page.url()})`);
    } else {
      console.error(
        "Usage: driver.mjs login-screenshot [outPath] | goto <path> [outPath]",
      );
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
