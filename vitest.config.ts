import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // src/env.ts validates at import time. Server actions reach it through the
    // mailer and other helpers, so give every run a syntactically valid set
    // rather than mocking @/env in each file. No test connects to these.
    env: {
      DATABASE_URL: "postgresql://aegis:aegis@localhost:5432/aegis_test",
      BETTER_AUTH_SECRET: "vitest-secret-that-is-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/services/**/*.ts"],
      exclude: ["src/lib/__tests__/**", "src/services/**/__tests__/**"],
      reporter: ["text", "text-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
