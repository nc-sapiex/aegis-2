import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__integration__/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    // One shared database: no parallelism, and generous timeouts because each
    // test truncates and re-seeds its own fixtures. Vitest 4 dropped
    // `poolOptions.threads.singleThread`; `fileParallelism: false` +
    // `maxWorkers: 1` is the equivalent.
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws outside an RSC environment; the DAL imports it.
      "server-only": path.resolve(
        __dirname,
        "./tests/integration/server-only-stub.ts",
      ),
    },
  },
});
