import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import {
  TASK_PRIORITY,
  isTaskVisible,
  pickNextTask,
  shouldEscalate,
  shouldRealert,
  snoozeUntil,
  sortTasks,
  taskText,
  type TaskLike,
} from "../tasks";

const NOW = new Date("2026-11-15T14:00:00Z");

function task(partial: Partial<TaskLike> & Pick<TaskLike, "id" | "type">): TaskLike {
  return {
    status: "OPEN",
    priority: TASK_PRIORITY[partial.type],
    createdAt: NOW,
    zoneId: "zone-a",
    lastAlertAt: NOW,
    ...partial,
  };
}

describe("priorities", () => {
  it("matches the masterplan", () => {
    expect(TASK_PRIORITY).toEqual({
      food_ready: 1,
      needs_order: 2,
      bill_requested: 3,
      clean_table: 4,
      custom: 4,
    });
  });
});

describe("pickNextTask", () => {
  it("returns null for an empty list", () => {
    expect(pickNextTask([], { now: NOW })).toBeNull();
  });

  it("always ranks food_ready above waiting-to-order", () => {
    const food = task({ id: "a", type: "food_ready", createdAt: new Date(NOW.getTime() + 60_000) });
    const order = task({ id: "b", type: "needs_order", createdAt: NOW });
    expect(pickNextTask([order, food], { now: NOW })?.id).toBe("a");
  });

  it("prefers the zone of the last completed task when priority ties", () => {
    const ground = task({ id: "g", type: "needs_order", zoneId: "ground", createdAt: NOW });
    const first = task({ id: "f", type: "needs_order", zoneId: "first", createdAt: new Date(NOW.getTime() + 30_000) });
    expect(pickNextTask([ground, first], { now: NOW, lastCompletedZoneId: "first" })?.id).toBe("f");
    expect(pickNextTask([ground, first], { now: NOW, lastCompletedZoneId: "ground" })?.id).toBe("g");
  });

  it("breaks remaining ties by oldest first", () => {
    const older = task({ id: "old", type: "custom", createdAt: new Date(NOW.getTime() - 60_000) });
    const newer = task({ id: "new", type: "custom", createdAt: NOW });
    expect(pickNextTask([newer, older], { now: NOW })?.id).toBe("old");
  });

  it("sorts deterministically by id as the last resort", () => {
    const a = task({ id: "aaa", type: "custom" });
    const b = task({ id: "bbb", type: "custom" });
    expect(sortTasks([b, a]).map((t) => t.id)).toEqual(["aaa", "bbb"]);
  });

  it("hides snoozed tasks until their snooze expires", () => {
    const snoozed = task({
      id: "s",
      type: "needs_order",
      status: "SNOOZED",
      snoozedUntil: new Date(NOW.getTime() + 300_000),
    });
    expect(pickNextTask([snoozed], { now: NOW })).toBeNull();
    const later = new Date(NOW.getTime() + 300_001);
    expect(pickNextTask([snoozed], { now: later })?.id).toBe("s");
  });

  it("ignores done and cancelled tasks", () => {
    expect(pickNextTask([task({ id: "d", type: "custom", status: "DONE" })], { now: NOW })).toBeNull();
    expect(pickNextTask([task({ id: "c", type: "custom", status: "CANCELLED" })], { now: NOW })).toBeNull();
  });

  it("keeps acknowledged tasks visible", () => {
    expect(isTaskVisible({ status: "ACK", snoozedUntil: null }, NOW)).toBe(true);
  });
});

describe("task copy", () => {
  it("includes the table and floor", () => {
    expect(taskText("needs_order", { tableLabel: "F2", zoneName: "First Floor" })).toBe(
      "Table F2 (First Floor) is waiting to order",
    );
    expect(taskText("food_ready", { tableLabel: "G1", zoneName: "Ground Floor" })).toBe(
      "Table G1 (Ground Floor) food is ready — pick up",
    );
  });

  it("handles takeaway tasks", () => {
    expect(taskText("needs_order", {})).toBe("Takeaway order is waiting to be taken");
  });
});

describe("alert timing", () => {
  it("re-alerts an open task every REALERT_S", () => {
    const t = task({ id: "a", type: "needs_order", lastAlertAt: NOW });
    expect(shouldRealert(t, new Date(NOW.getTime() + 59_999), DEFAULT_SETTINGS)).toBe(false);
    expect(shouldRealert(t, new Date(NOW.getTime() + 60_000), DEFAULT_SETTINGS)).toBe(true);
    expect(shouldRealert({ ...t, status: "ACK" }, new Date(NOW.getTime() + 120_000), DEFAULT_SETTINGS)).toBe(false);
  });

  it("escalates unacknowledged work after 120s", () => {
    const t = task({ id: "a", type: "needs_order", createdAt: NOW });
    expect(shouldEscalate(t, new Date(NOW.getTime() + 119_999), DEFAULT_SETTINGS)).toBe(false);
    expect(shouldEscalate(t, new Date(NOW.getTime() + 120_000), DEFAULT_SETTINGS)).toBe(true);
    expect(shouldEscalate({ ...t, escalatedAt: NOW }, new Date(NOW.getTime() + 200_000), DEFAULT_SETTINGS)).toBe(false);
    expect(shouldEscalate({ ...t, status: "DONE" }, new Date(NOW.getTime() + 200_000), DEFAULT_SETTINGS)).toBe(false);
  });

  it("snoozes for SNOOZE_S", () => {
    expect(snoozeUntil(NOW, DEFAULT_SETTINGS).getTime()).toBe(NOW.getTime() + 300_000);
  });
});
