import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AEGIS E2E tests
 *
 * Runs against the Docker container on localhost:3000.
 * Auth setup creates storageState files for 4 roles.
 */
/**
 * The role projects below carry no `testMatch`, so every spec replays once per
 * project. That is harmless for read-only specs but fatal for the core cycle:
 * five serial runs against one database would each see the previous run's RAM
 * assessment, committed plan and engagement. These two specs therefore run in
 * exactly one project, and are excluded from the role projects.
 *
 * Alphabetical file order inside that project puts core-cycle before
 * tenant-isolation, which is what the isolation assertion needs — it must read
 * tenant B *after* tenant A's cycle has mutated the database.
 */
const CORE_CYCLE_SPECS = /(core-cycle|tenant-isolation)\.spec\.ts/;

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
      testIgnore: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/auditor.json",
      },
      dependencies: ["setup"],
    },

    // Manager tests
    {
      name: "manager",
      testIgnore: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: ["setup"],
    },

    // CAE tests
    {
      name: "cae",
      testIgnore: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/cae.json",
      },
      dependencies: ["setup"],
    },

    // CCO tests
    {
      name: "cco",
      testIgnore: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/cco.json",
      },
      dependencies: ["setup"],
    },

    // Auditee tests
    {
      name: "auditee",
      testIgnore: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/auditee.json",
      },
      dependencies: ["setup"],
    },

    // The full RBIA cycle and the second-tenant isolation check — exactly one
    // run each, in file order. Each describe block picks its own storageState,
    // so this project sets none. The cycle drives ~40 server actions end to
    // end, well past the 30s default.
    {
      name: "core",
      testMatch: CORE_CYCLE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        // The base config's `trace: "on-first-retry"` produces nothing here,
        // because `retries: 0` below means there is never a first retry. A
        // failure in an 11-step serial cycle is the case where a trace is
        // worth most, so capture one whenever a test fails.
        trace: "retain-on-failure",
      },
      timeout: 300_000,
      dependencies: ["setup"],
      // A retry re-runs the whole serial block from the top, but the cycle
      // mutates the database as it goes — the second attempt at "RAM
      // assessment is scored and computed" meets an already-COMPUTED
      // assessment and fails for a different reason than the first. Retrying
      // turns one real failure into three misleading ones. Fail once, legibly.
      retries: 0,
    },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
