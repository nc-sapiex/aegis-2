import { describe, it, expect } from "vitest";
import {
  setSessionContext,
  ACTIONS_REQUIRING_JUSTIFICATION,
  type Actor,
  type RawExecutor,
} from "@/lib/session-context";

/** Captures the SQL a $executeRaw tagged template would run. */
function recorder() {
  const settings = new Map<string, string>();
  const tx: RawExecutor = {
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]) {
      const sql = query.join("?");
      const name = /set_config\('([^']+)'/.exec(sql)?.[1];
      if (name) settings.set(name, String(values[0]));
      return Promise.resolve(1);
    },
  };
  return { tx, settings };
}

const USER: Actor = {
  kind: "user",
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  ipAddress: "10.0.0.1",
  sessionId: "sess-1",
};

const SYSTEM: Actor = {
  kind: "system",
  tenantId: "22222222-2222-4222-8222-222222222222",
};

describe("setSessionContext", () => {
  it("writes every setting the trigger reads for a user actor", async () => {
    const { tx, settings } = recorder();
    await setSessionContext(tx, {
      actor: USER,
      actionType: "finding.closed",
      justification: "Remediated",
    });

    expect(settings.get("app.current_action")).toBe("finding.closed");
    expect(settings.get("app.current_justification")).toBe("Remediated");
    expect(settings.get("app.current_tenant_id")).toBe(USER.tenantId);
    expect(settings.get("app.current_user_id")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(settings.get("app.current_ip_address")).toBe("10.0.0.1");
    expect(settings.get("app.current_session_id")).toBe("sess-1");
  });

  // The trigger casts _user_id::UUID. An empty string raises
  // `invalid input syntax for type uuid: ""` and aborts the mutation, so the
  // setting must be left unset — it then reads back as NULL.
  it("leaves user id UNSET for a system actor, never empty string", async () => {
    const { tx, settings } = recorder();
    await setSessionContext(tx, {
      actor: SYSTEM,
      actionType: "notification.sent",
    });

    expect(settings.has("app.current_user_id")).toBe(false);
    expect(settings.get("app.current_tenant_id")).toBe(SYSTEM.tenantId);
  });

  it("always sets a tenant, which the trigger requires as NOT NULL", async () => {
    for (const actor of [USER, SYSTEM]) {
      const { tx, settings } = recorder();
      await setSessionContext(tx, { actor, actionType: "x.y" });
      expect(settings.get("app.current_tenant_id")).toBe(actor.tenantId);
    }
  });

  it("defaults an absent justification to empty string, not undefined", async () => {
    const { tx, settings } = recorder();
    await setSessionContext(tx, { actor: USER, actionType: "x.y" });
    expect(settings.get("app.current_justification")).toBe("");
  });

  it("names exactly the four DE6 actions", () => {
    expect([...ACTIONS_REQUIRING_JUSTIFICATION].sort()).toEqual([
      "compliance.marked_na",
      "finding.closed",
      "observation.status_changed",
      "user.role_changed",
    ]);
  });
});
