/**
 * Invitation tokens are bearer credentials. This is a source scan, the same
 * technique as tenant-isolation.test.ts, because the defect it guards against
 * is a logging statement rather than a return value.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(process.cwd(), "src/actions/user-invitations.ts"),
  "utf-8",
);

describe("invitation token hygiene", () => {
  it("writes nothing to the console", () => {
    expect(SOURCE).not.toContain("console.log");
  });

  it("builds no token-bearing URL in the action layer", () => {
    // URL construction belongs to src/lib/invitation-mailer.ts, which hands
    // the link straight to SES and never to the logger.
    expect(SOURCE).not.toMatch(/token=\$\{/);
  });

  it("returns no raw token to the caller", () => {
    expect(SOURCE).not.toMatch(/return\s*\{[^}]*rawToken/);
  });
});
