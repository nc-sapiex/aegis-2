import { describe, it, expect } from "vitest";
import {
  computeEscalation,
  computeBatchEscalation,
} from "@/lib/escalation-engine";

/**
 * Default SLA: ComplianceItem.dueDate is createdAt + 30 days
 * (see createComplianceItem / ISSUED-transition auto-create).
 */
const CREATED = new Date("2026-09-01T00:00:00Z");
const DUE = new Date("2026-10-01T00:00:00Z"); // +30 days

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("computeEscalation", () => {
  it("treats a newly created 30-day SLA item as not overdue (L0)", () => {
    const result = computeEscalation(CREATED, DUE, 0, CREATED);

    expect(result.daysOpen).toBe(0);
    expect(result.daysOverdue).toBe(0);
    expect(result.escalationLevel).toBe(0);
    expect(result.shouldNotify).toBe(false);
  });

  it("stays L0 the day before the due date", () => {
    const result = computeEscalation(CREATED, DUE, 0, addDays(DUE, -1));

    expect(result.daysOverdue).toBe(0);
    expect(result.escalationLevel).toBe(0);
    expect(result.shouldNotify).toBe(false);
  });

  it("is 0 days overdue on the due date itself", () => {
    const result = computeEscalation(CREATED, DUE, 0, DUE);

    expect(result.daysOverdue).toBe(0);
    expect(result.escalationLevel).toBe(0);
  });

  it("reaches L1 at 15 days past due", () => {
    const result = computeEscalation(CREATED, DUE, 0, addDays(DUE, 15));

    expect(result.daysOverdue).toBe(15);
    expect(result.escalationLevel).toBe(1);
    expect(result.shouldNotify).toBe(true);
  });

  it("reaches L2 (ZAC) at 30 days past due, not 30 days before due", () => {
    const result = computeEscalation(CREATED, DUE, 1, addDays(DUE, 30));

    expect(result.daysOverdue).toBe(30);
    expect(result.escalationLevel).toBe(2);
    expect(result.shouldNotify).toBe(true);
  });

  it("reaches L3 (ACE) at 90 days past due", () => {
    const result = computeEscalation(CREATED, DUE, 2, addDays(DUE, 90));

    expect(result.daysOverdue).toBe(90);
    expect(result.escalationLevel).toBe(3);
    expect(result.shouldNotify).toBe(true);
  });

  it("reaches L4 (ACB) at 180 days past due", () => {
    const result = computeEscalation(CREATED, DUE, 3, addDays(DUE, 180));

    expect(result.daysOverdue).toBe(180);
    expect(result.escalationLevel).toBe(4);
    expect(result.shouldNotify).toBe(true);
  });

  it("does not notify when the level has not increased", () => {
    const result = computeEscalation(CREATED, DUE, 2, addDays(DUE, 30));

    expect(result.escalationLevel).toBe(2);
    expect(result.shouldNotify).toBe(false);
  });

  it("does not notify on a level drop (corrects a previously-wrong level)", () => {
    // Item was stored as L2 while still inside SLA; next run must not email.
    const result = computeEscalation(CREATED, DUE, 2, CREATED);

    expect(result.escalationLevel).toBe(0);
    expect(result.shouldNotify).toBe(false);
  });
});

describe("computeBatchEscalation", () => {
  it("does not emit an update for a brand-new item still inside SLA", () => {
    const updates = computeBatchEscalation(
      [
        {
          id: "new-item",
          createdAt: CREATED,
          dueDate: DUE,
          escalationLevel: 0,
        },
      ],
      CREATED,
    );

    expect(updates).toEqual([]);
  });

  it("emits an L2 update only once the item is 30 days past due", () => {
    const updates = computeBatchEscalation(
      [
        {
          id: "overdue-item",
          createdAt: CREATED,
          dueDate: DUE,
          escalationLevel: 1,
        },
      ],
      addDays(DUE, 30),
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "overdue-item",
      previousLevel: 1,
      newEscalationLevel: 2,
      daysOverdue: 30,
      shouldNotify: true,
    });
  });

  it("emits a silent correction when a stored level is ahead of reality", () => {
    const updates = computeBatchEscalation(
      [
        {
          id: "false-l2",
          createdAt: CREATED,
          dueDate: DUE,
          escalationLevel: 2,
        },
      ],
      CREATED,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "false-l2",
      previousLevel: 2,
      newEscalationLevel: 0,
      daysOverdue: 0,
      shouldNotify: false,
    });
  });
});
