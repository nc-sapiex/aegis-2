import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AEGIS E2E tests
 *
 * Runs against the Docker container on localhost:3000.
 * Auth setup creates storageState files for 4 roles.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Serial for state-dependent tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30000,

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
  },

  projects: [
    // Auth setup runs first
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    // Auditor tests
    {
      name: "auditor",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/auditor.json",
      },
      dependencies: ["setup"],
    },

    // Manager tests
    {
      name: "manager",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: ["setup"],
    },

    // CAE tests
    {
      name: "cae",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/cae.json",
      },
      dependencies: ["setup"],
    },

    // CCO tests
    {
      name: "cco",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/cco.json",
      },
      dependencies: ["setup"],
    },

    // Auditee tests
    {
      name: "auditee",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/auditee.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
