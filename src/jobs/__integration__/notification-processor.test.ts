import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
  withFixtures,
} from "../../../tests/integration/harness";

const sent: Array<{ to: string; subject: string }> = [];

function mockEmail() {
  sent.length = 0;
  vi.doMock("@/lib/ses-client", () => ({
    sendEmail: vi.fn(async (msg: { to: string; subject: string }) => {
      sent.push({ to: msg.to, subject: msg.subject });
      return { success: true, messageId: `ses-${sent.length}` };
    }),
  }));
  vi.doMock("@/emails/render", () => ({
    renderEmailTemplate: vi.fn(async () => ({
      subject: "Test subject",
      html: "<p>test</p>",
      text: "test",
    })),
  }));
}

async function queue(
  tenantId: string,
  recipientId: string,
  batchKey: string | null,
) {
  return withFixtures(async () => {
    return integrationPrisma.notificationQueue.create({
      data: {
        tenantId,
        recipientId,
        type: "OBSERVATION_ASSIGNED",
        status: "PENDING",
        batchKey,
        sendAfter: new Date(Date.now() - 1000),
        payload: { observationTitle: "Probe" },
      },
      select: { id: true },
    });
  });
}

describe("processNotifications", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
    mockEmail();
  });

  it("sends each notification once when two workers overlap", async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, ["AUDITEE"]);
    for (let i = 0; i < 5; i++) await queue(tenant.id, user.id, null);

    const { processNotifications } = await import("../notification-processor");
    await Promise.all([processNotifications(), processNotifications()]);

    expect(sent).toHaveLength(5);
    const states = await integrationPrisma.notificationQueue.groupBy({
      by: ["status"],
      _count: true,
    });
    expect(states).toEqual([{ status: "SENT", _count: 5 }]);
  });

  it("never batches across recipients that share a batchKey", async () => {
    const tenant = await createTenant();
    const alice = await createUser(tenant.id, ["AUDITEE"]);
    const bob = await createUser(tenant.id, ["AUDITEE"]);
    await queue(tenant.id, alice.id, "weekly");
    await queue(tenant.id, alice.id, "weekly");
    await queue(tenant.id, bob.id, "weekly");

    const { processNotifications } = await import("../notification-processor");
    await processNotifications();

    // One digest per recipient, never one digest to the wrong person.
    expect(sent).toHaveLength(2);
    const recipients = await integrationPrisma.user.findMany({
      where: { id: { in: [alice.id, bob.id] } },
      select: { email: true },
    });
    expect(new Set(sent.map((s) => s.to))).toEqual(
      new Set(recipients.map((r) => r.email)),
    );
  });

  it("never batches across tenants that share a batchKey", async () => {
    const one = await createTenant("Bank One");
    const two = await createTenant("Bank Two");
    const userOne = await createUser(one.id, ["AUDITEE"]);
    const userTwo = await createUser(two.id, ["AUDITEE"]);
    await queue(one.id, userOne.id, "weekly");
    await queue(two.id, userTwo.id, "weekly");

    const { processNotifications } = await import("../notification-processor");
    await processNotifications();

    expect(sent).toHaveLength(2);
    const logs = await integrationPrisma.emailLog.findMany({
      select: { tenantId: true },
    });
    expect(new Set(logs.map((l) => l.tenantId))).toEqual(
      new Set([one.id, two.id]),
    );
  });
});
