import { describe, it, expect } from "vitest";
import { userActor, systemActor } from "@/data-access/audited-mutation";

describe("userActor", () => {
  it("carries the session id through to the actor", () => {
    const actor = userActor({
      user: { id: "user-1", tenantId: "tenant-1" },
      session: { id: "session-1" },
    });

    expect(actor).toEqual({
      kind: "user",
      userId: "user-1",
      tenantId: "tenant-1",
      sessionId: "session-1",
    });
  });

  it("leaves sessionId undefined when the caller has no session (e.g. an unauthenticated invite acceptance)", () => {
    const actor = userActor({ user: { id: "user-1", tenantId: "tenant-1" } });

    expect(actor).toEqual({
      kind: "user",
      userId: "user-1",
      tenantId: "tenant-1",
      sessionId: undefined,
    });
  });
});

describe("systemActor", () => {
  it("carries no user — scheduled work is attributed to the platform, not a person", () => {
    expect(systemActor("tenant-1")).toEqual({
      kind: "system",
      tenantId: "tenant-1",
    });
  });
});
