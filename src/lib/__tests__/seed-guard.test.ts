import { describe, expect, it } from "vitest";
import { assertSafeSeedTarget } from "@/lib/seed-guard";

describe("assertSafeSeedTarget", () => {
  it("throws when database URL is missing", () => {
    expect(() =>
      assertSafeSeedTarget({
        nodeEnv: "development",
      }),
    ).toThrow(/DATABASE_URL is required for seeding/);
  });

  it("throws in production", () => {
    expect(() =>
      assertSafeSeedTarget({
        nodeEnv: "production",
        databaseUrl: "http://localhost/aegis",
      }),
    ).toThrow(/Refusing to run destructive seed/);
  });

  it("throws for production-like database names", () => {
    expect(() =>
      assertSafeSeedTarget({
        nodeEnv: "development",
        databaseUrl: "http://localhost/aegis_prod",
      }),
    ).toThrow(/Refusing to run destructive seed/);
  });

  it("allows explicit override", () => {
    expect(() =>
      assertSafeSeedTarget({
        nodeEnv: "production",
        databaseUrl: "http://localhost/aegis_prod",
        allowDestructiveSeed: "true",
      }),
    ).not.toThrow();
  });
});
