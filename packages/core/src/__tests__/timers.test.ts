import { describe, expect, it } from "vitest";
import {
  addSeconds,
  businessDayEnd,
  businessDayStart,
  deadlineFrom,
  isDecisionDue,
  secondsUntil,
  shouldAbandon,
} from "../stateMachine";
import { DEFAULT_SETTINGS } from "../settings";

const MINUTE = 60_000;

describe("deadline helpers", () => {
  it("adds the decision window exactly", () => {
    const now = new Date("2026-11-15T14:00:00Z");
    expect(deadlineFrom(now, 180).toISOString()).toBe("2026-11-15T14:03:00.000Z");
    expect(addSeconds(now, 300).getTime()).toBe(now.getTime() + 300_000);
  });

  it("counts down without going negative", () => {
    const now = new Date("2026-11-15T14:00:00Z");
    expect(secondsUntil(new Date(now.getTime() + 90_500), now)).toBe(91);
    expect(secondsUntil(new Date(now.getTime() - 5_000), now)).toBe(0);
  });

  it("is due at and after the deadline, but not before", () => {
    const deadline = new Date("2026-11-15T14:03:00Z");
    const base = { decisionDeadline: deadline, state: "occupied" as const, hasOrders: false };
    expect(isDecisionDue(base, new Date(deadline.getTime() - 1))).toBe(false);
    expect(isDecisionDue(base, deadline)).toBe(true);
    expect(isDecisionDue(base, new Date(deadline.getTime() + 5_000))).toBe(true);
  });

  it("is not due when an order exists", () => {
    const deadline = new Date("2026-11-15T14:03:00Z");
    expect(isDecisionDue({ decisionDeadline: deadline, state: "occupied", hasOrders: true }, new Date("2026-11-15T15:00:00Z"))).toBe(false);
  });

  it("is not due when the table already left occupied", () => {
    const deadline = new Date("2026-11-15T14:03:00Z");
    expect(isDecisionDue({ decisionDeadline: deadline, state: "needs_order", hasOrders: false }, new Date("2026-11-15T15:00:00Z"))).toBe(false);
  });
});

describe("abandon rule", () => {
  const now = new Date("2026-11-15T14:10:00Z");

  it("waits the full EMPTY_CONFIRM_S", () => {
    const emptyAt = new Date(now.getTime() - 59_000);
    expect(shouldAbandon({ state: "occupied", hasOrders: false, emptyAt }, now, DEFAULT_SETTINGS)).toBe(false);
    const emptyAt60 = new Date(now.getTime() - 60_000);
    expect(shouldAbandon({ state: "occupied", hasOrders: false, emptyAt: emptyAt60 }, now, DEFAULT_SETTINGS)).toBe(true);
  });

  it("never abandons a party with orders", () => {
    expect(
      shouldAbandon({ state: "occupied", hasOrders: true, emptyAt: new Date(0) }, now, DEFAULT_SETTINGS),
    ).toBe(false);
  });

  it("only applies to occupied and needs_order", () => {
    const old = new Date(0);
    for (const state of ["ordered", "dining", "bill_requested", "free", "needs_cleaning"] as const) {
      expect(shouldAbandon({ state, hasOrders: false, emptyAt: old }, now, DEFAULT_SETTINGS)).toBe(false);
    }
  });

  it("requires a recorded empty timestamp", () => {
    expect(shouldAbandon({ state: "occupied", hasOrders: false, emptyAt: null }, now, DEFAULT_SETTINGS)).toBe(false);
  });
});

describe("business day (Asia/Kolkata, 05:00 cutoff)", () => {
  it("puts 02:00 IST sales on the previous business day", () => {
    const at = new Date("2026-11-15T20:30:00Z");
    expect(businessDayStart(at, "05:00").toISOString()).toBe("2026-11-14T23:30:00.000Z");
  });

  it("starts a new business day at 05:00 IST", () => {
    expect(businessDayStart(new Date("2026-11-15T23:29:59Z"), "05:00").toISOString()).toBe(
      "2026-11-14T23:30:00.000Z",
    );
    expect(businessDayStart(new Date("2026-11-15T23:30:00Z"), "05:00").toISOString()).toBe(
      "2026-11-15T23:30:00.000Z",
    );
  });

  it("handles lunch and dinner on the same wall day", () => {
    const lunch = businessDayStart(new Date("2026-11-15T08:00:00Z"), "05:00");
    const dinner = businessDayStart(new Date("2026-11-15T15:00:00Z"), "05:00");
    expect(lunch.toISOString()).toBe(dinner.toISOString());
    expect(businessDayEnd(dinner).getTime() - dinner.getTime()).toBe(24 * 60 * MINUTE);
  });

  it("supports a different configured cutoff", () => {
    expect(businessDayStart(new Date("2026-11-15T00:00:00Z"), "06:00").toISOString()).toBe(
      "2026-11-14T00:30:00.000Z",
    );
  });
});
