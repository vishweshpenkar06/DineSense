import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { transition } from "../stateMachine";
import type { Effect, TableContext, TableEvent, TableState } from "../types";

const AT = new Date("2026-11-15T14:00:00.000Z");

function ctx(state: TableState, overrides: Partial<TableContext> = {}): TableContext {
  return {
    state,
    hasOpenSession: state !== "free",
    hasOrders: false,
    hasUnpaidBill: false,
    isFirstOrder: true,
    ...overrides,
  };
}

function kinds(effects: Effect[]): string[] {
  return effects.map((effect) => {
    if (effect.kind === "createTask" || effect.kind === "cancelTasks" || effect.kind === "completeTasks") {
      return `${effect.kind}:${effect.taskType}`;
    }
    return effect.kind;
  });
}

function run(state: TableState, event: TableEvent, overrides: Partial<TableContext> = {}) {
  return transition(ctx(state, overrides), event, DEFAULT_SETTINGS);
}

describe("transition: VISION_OCCUPIED", () => {
  it("free -> occupied opens a session with a 180s deadline", () => {
    const result = run("free", { type: "VISION_OCCUPIED", at: AT }, { hasOpenSession: false });
    expect(result.state).toBe("occupied");
    expect(result.changed).toBe(true);
    const open = result.effects.find((e) => e.kind === "openSession");
    expect(open).toMatchObject({ kind: "openSession" });
    if (open?.kind === "openSession") {
      expect(open.deadlineAt?.getTime()).toBe(AT.getTime() + 180_000);
    }
  });

  it("needs_cleaning -> occupied completes the cleaning task and opens a new session", () => {
    const result = run("needs_cleaning", { type: "VISION_OCCUPIED", at: AT }, { hasOpenSession: false });
    expect(result.state).toBe("occupied");
    expect(kinds(result.effects)).toContain("completeTasks:clean_table");
    expect(kinds(result.effects)).toContain("openSession");
  });

  it.each(["occupied", "ordered", "food_ready", "dining", "bill_requested"] as const)(
    "does not change %s when a person is still detected",
    (state) => {
      const result = run(state, { type: "VISION_OCCUPIED", at: AT });
      expect(result.state).toBe(state);
      expect(result.changed).toBe(false);
      expect(result.effects).toHaveLength(0);
    },
  );
});

describe("transition: TIMER_EXPIRED", () => {
  it("occupied without orders -> needs_order and creates the alert task", () => {
    const result = run("occupied", { type: "TIMER_EXPIRED", at: AT });
    expect(result.state).toBe("needs_order");
    expect(kinds(result.effects)).toEqual(["createTask:needs_order"]);
    expect(result.effects[0]).toMatchObject({ priority: 2 });
  });

  it("does nothing when an order already exists", () => {
    const result = run("occupied", { type: "TIMER_EXPIRED", at: AT }, { hasOrders: true });
    expect(result.state).toBe("occupied");
    expect(result.changed).toBe(false);
  });

  it("is idempotent once the table is needs_order", () => {
    const first = run("occupied", { type: "TIMER_EXPIRED", at: AT });
    expect(first.state).toBe("needs_order");
    const second = run("needs_order", { type: "TIMER_EXPIRED", at: AT });
    expect(second.changed).toBe(false);
    expect(second.effects).toHaveLength(0);
  });
});

describe("transition: ORDER_PLACED", () => {
  it.each(["occupied", "needs_order"] as const)("%s -> ordered cancels the waiting task", (state) => {
    const result = run(state, { type: "ORDER_PLACED", at: AT });
    expect(result.state).toBe("ordered");
    expect(kinds(result.effects)).toContain("cancelTasks:needs_order");
    expect(kinds(result.effects)).toContain("setFirstOrderAt");
  });

  it("does not set firstOrderAt on subsequent orders", () => {
    const result = run("ordered", { type: "ORDER_PLACED", at: AT }, { hasOrders: true, isFirstOrder: false });
    expect(result.state).toBe("ordered");
    expect(kinds(result.effects)).not.toContain("setFirstOrderAt");
  });

  it("dining -> ordered (new ticket after everything was served)", () => {
    const result = run("dining", { type: "ORDER_PLACED", at: AT }, { hasOrders: true, isFirstOrder: false });
    expect(result.state).toBe("ordered");
  });

  it.each(["food_ready", "ordered"] as const)("%s stays unchanged on another ticket", (state) => {
    const result = run(state, { type: "ORDER_PLACED", at: AT }, { hasOrders: true, isFirstOrder: false });
    expect(result.state).toBe(state);
    expect(result.changed).toBe(false);
  });

  it.each(["free", "needs_cleaning", "bill_requested"] as const)("ignores an order in %s", (state) => {
    const result = run(state, { type: "ORDER_PLACED", at: AT });
    expect(result.changed).toBe(false);
  });
});

describe("transition: kitchen and service", () => {
  it("ordered -> food_ready creates the highest priority task", () => {
    const result = run("ordered", { type: "ORDER_READY", at: AT }, { hasOrders: true });
    expect(result.state).toBe("food_ready");
    expect(result.effects[0]).toMatchObject({ kind: "createTask", taskType: "food_ready", priority: 1 });
  });

  it("ignores ORDER_READY when not ordered", () => {
    expect(run("dining", { type: "ORDER_READY", at: AT }).changed).toBe(false);
  });

  it("food_ready -> dining with ALL_SERVED completes the task", () => {
    const result = run("food_ready", { type: "ALL_SERVED", at: AT }, { hasOrders: true });
    expect(result.state).toBe("dining");
    expect(kinds(result.effects)).toEqual(["completeTasks:food_ready"]);
  });

  it("ignores ALL_SERVED in other states", () => {
    expect(run("ordered", { type: "ALL_SERVED", at: AT }).changed).toBe(false);
  });
});

describe("transition: billing", () => {
  it.each(["ordered", "food_ready", "dining"] as const)(
    "%s -> bill_requested creates a priority 3 task",
    (state) => {
      const result = run(state, { type: "BILL_REQUESTED", at: AT }, { hasOrders: true });
      expect(result.state).toBe("bill_requested");
      expect(result.effects[0]).toMatchObject({ kind: "createTask", taskType: "bill_requested", priority: 3 });
    },
  );

  it.each(["occupied", "needs_order", "free", "needs_cleaning"] as const)(
    "ignores bill requests in %s",
    (state) => {
      expect(run(state, { type: "BILL_REQUESTED", at: AT }).changed).toBe(false);
    },
  );

  it.each(["occupied", "needs_order", "ordered", "food_ready", "dining", "bill_requested"] as const)(
    "BILL_PAID on %s closes the session and starts cleaning",
    (state) => {
      const result = run(state, { type: "BILL_PAID", at: AT });
      expect(result.state).toBe("needs_cleaning");
      expect(kinds(result.effects)).toEqual([
        "closeSession",
        "completeTasks:bill_requested",
        "createTask:clean_table",
      ]);
    },
  );

  it("rejects BILL_PAID without an open session", () => {
    const result = run("free", { type: "BILL_PAID", at: AT }, { hasOpenSession: false });
    expect(result.changed).toBe(false);
  });

  it("is idempotent when already needs_cleaning", () => {
    const result = run("needs_cleaning", { type: "BILL_PAID", at: AT });
    expect(result.changed).toBe(false);
  });

  it("needs_cleaning -> free on CLEANED", () => {
    const result = run("needs_cleaning", { type: "CLEANED", at: AT }, { hasOpenSession: false });
    expect(result.state).toBe("free");
    expect(kinds(result.effects)).toEqual(["completeTasks:clean_table"]);
  });

  it("closes any still-open visit when cleaning", () => {
    const result = run("needs_cleaning", { type: "CLEANED", at: AT }, { hasOpenSession: true });
    expect(result.state).toBe("free");
    expect(kinds(result.effects)).toContain("closeSession");
    expect(kinds(result.effects)).toContain("cancelOpenTasks");
  });

  it("ignores CLEANED when not needs_cleaning", () => {
    expect(run("free", { type: "CLEANED", at: AT }).changed).toBe(false);
  });
});

describe("transition: vision empty never ends an unpaid visit", () => {
  it.each([
    "occupied",
    "needs_order",
    "ordered",
    "food_ready",
    "dining",
    "bill_requested",
    "needs_cleaning",
    "free",
  ] as const)("VISION_EMPTY leaves %s untouched", (state) => {
    const result = run(state, { type: "VISION_EMPTY", at: AT });
    expect(result.state).toBe(state);
    expect(result.changed).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

describe("transition: MANUAL_SET", () => {
  it("audits the override", () => {
    const result = run("occupied", { type: "MANUAL_SET", at: AT, target: "dining" });
    expect(result.state).toBe("dining");
    expect(kinds(result.effects)).toContain("audit");
  });

  it("opens a session when setting an active state on a free table", () => {
    const result = run("free", { type: "MANUAL_SET", at: AT, target: "occupied" }, { hasOpenSession: false });
    expect(result.state).toBe("occupied");
    expect(kinds(result.effects)).toContain("openSession");
  });

  it("closes and voids the session when manually freeing the table", () => {
    const result = run("ordered", { type: "MANUAL_SET", at: AT, target: "free" });
    expect(result.state).toBe("free");
    expect(kinds(result.effects)).toContain("closeSession");
    expect(kinds(result.effects)).toContain("cancelOpenTasks");
    const close = result.effects.find((e) => e.kind === "closeSession");
    expect(close).toMatchObject({ reason: "VOID" });
  });

  it("does not create a session when manually setting free", () => {
    const result = run("free", { type: "MANUAL_SET", at: AT, target: "free" }, { hasOpenSession: false });
    expect(result.state).toBe("free");
    expect(kinds(result.effects)).not.toContain("openSession");
  });
});

describe("transition: invariants", () => {
  it("re-applying the resulting state with the same event never duplicates work", () => {
    const events: TableEvent[] = [
      { type: "VISION_OCCUPIED", at: AT },
      { type: "TIMER_EXPIRED", at: AT },
      { type: "ORDER_PLACED", at: AT },
      { type: "ORDER_READY", at: AT },
      { type: "ALL_SERVED", at: AT },
      { type: "BILL_REQUESTED", at: AT },
    ];
    let state: TableState = "free";
    let hasOpenSession = false;
    for (const event of events) {
      const first = transition(
        { state, hasOpenSession, hasOrders: state !== "occupied" && state !== "needs_order", hasUnpaidBill: false, isFirstOrder: false },
        event,
        DEFAULT_SETTINGS,
      );
      state = first.state;
      if (event.type === "VISION_OCCUPIED") hasOpenSession = true;
      const again = transition(
        { state, hasOpenSession, hasOrders: true, hasUnpaidBill: false, isFirstOrder: false },
        event,
        DEFAULT_SETTINGS,
      );
      if (event.type !== "MANUAL_SET") {
        expect(again.changed).toBe(false);
        expect(again.effects).toHaveLength(0);
      }
    }
  });
});
