import type { Settings } from "./settings";
import type {
  Effect,
  SessionCloseReason,
  TableContext,
  TableEvent,
  TableState,
  TransitionResult,
} from "./types";
import { ACTIVE_TABLE_STATES } from "./types";

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function deadlineFrom(occupiedAt: Date, windowSeconds: number): Date {
  return addSeconds(occupiedAt, windowSeconds);
}

export function secondsUntil(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

export function isDecisionDue(
  session: { decisionDeadline: Date | null; state: TableState; hasOrders: boolean },
  now: Date,
): boolean {
  return (
    session.state === "occupied" &&
    !session.hasOrders &&
    session.decisionDeadline !== null &&
    now.getTime() >= session.decisionDeadline.getTime()
  );
}

export function shouldAbandon(
  session: { state: TableState; hasOrders: boolean; emptyAt: Date | null },
  now: Date,
  settings: Settings,
): boolean {
  if (session.state !== "occupied" && session.state !== "needs_order") return false;
  if (session.hasOrders) return false;
  if (!session.emptyAt) return false;
  return now.getTime() >= addSeconds(session.emptyAt, settings.EMPTY_CONFIRM_S).getTime();
}

/**
 * Start of the business day containing `at`, in Asia/Kolkata wall time.
 * A bill at 02:00 on 16 Nov belongs to the business day that started 05:00 on 15 Nov.
 */
export function businessDayStart(at: Date, startHHMM: string): Date {
  const [hours, minutes] = startHHMM.split(":").map(Number);
  const h = hours ?? 5;
  const m = minutes ?? 0;

  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  let startLocalMs = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    h,
    m,
    0,
    0,
  );
  if (ist.getTime() < startLocalMs) startLocalMs -= 24 * 60 * 60 * 1000;

  return new Date(startLocalMs - IST_OFFSET_MS);
}

export function businessDayEnd(start: Date): Date {
  return addSeconds(start, 24 * 60 * 60);
}

function unchanged(ctx: TableContext): TransitionResult {
  return { state: ctx.state, changed: false, effects: [] };
}

function move(state: TableState, effects: Effect[]): TransitionResult {
  return { state, changed: true, effects };
}

function closeSession(reason: SessionCloseReason, at: Date): Effect {
  return { kind: "closeSession", reason, at };
}

export function transition(ctx: TableContext, event: TableEvent, settings: Settings): TransitionResult {
  switch (event.type) {
    case "VISION_OCCUPIED": {
      if (ctx.state === "free" || ctx.state === "needs_cleaning") {
        const effects: Effect[] = [];
        if (ctx.state === "needs_cleaning") {
          effects.push({ kind: "completeTasks", taskType: "clean_table" });
        }
        effects.push({
          kind: "openSession",
          deadlineAt: deadlineFrom(event.at, settings.DECIDE_WINDOW_S),
        });
        return move("occupied", effects);
      }
      return unchanged(ctx);
    }

    case "VISION_EMPTY":
      return unchanged(ctx);

    case "TIMER_EXPIRED": {
      if (ctx.state !== "occupied" || ctx.hasOrders) return unchanged(ctx);
      return move("needs_order", [
        { kind: "createTask", taskType: "needs_order", priority: 2 },
      ]);
    }

    case "ORDER_PLACED": {
      if (ctx.state === "occupied" || ctx.state === "needs_order") {
        const effects: Effect[] = [
          { kind: "cancelTasks", taskType: "needs_order" },
        ];
        if (ctx.isFirstOrder) effects.push({ kind: "setFirstOrderAt", at: event.at });
        return move("ordered", effects);
      }
      if (ctx.state === "dining") {
        return move("ordered", []);
      }
      return unchanged(ctx);
    }

    case "ORDER_READY": {
      if (ctx.state !== "ordered") return unchanged(ctx);
      return move("food_ready", [
        { kind: "createTask", taskType: "food_ready", priority: 1 },
      ]);
    }

    case "ALL_SERVED": {
      if (ctx.state !== "food_ready") return unchanged(ctx);
      return move("dining", [{ kind: "completeTasks", taskType: "food_ready" }]);
    }

    case "BILL_REQUESTED": {
      if (ctx.state !== "ordered" && ctx.state !== "food_ready" && ctx.state !== "dining") {
        return unchanged(ctx);
      }
      return move("bill_requested", [
        { kind: "createTask", taskType: "bill_requested", priority: 3 },
      ]);
    }

    case "BILL_PAID": {
      if (!ctx.hasOpenSession) return unchanged(ctx);
      if (ctx.state === "needs_cleaning") return unchanged(ctx);
      return move("needs_cleaning", [
        closeSession("PAID", event.at),
        { kind: "completeTasks", taskType: "bill_requested" },
        { kind: "createTask", taskType: "clean_table", priority: 4 },
      ]);
    }

    case "CLEANED": {
      if (ctx.state !== "needs_cleaning") return unchanged(ctx);
      const effects: Effect[] = [];
      if (ctx.hasOpenSession) {
        effects.push(closeSession("VOID", event.at), { kind: "cancelOpenTasks" });
      }
      effects.push({ kind: "completeTasks", taskType: "clean_table" });
      return move("free", effects);
    }

    case "MANUAL_SET": {
      const target = event.target;
      const effects: Effect[] = [
        {
          kind: "audit",
          action: "table.manual_set",
          detail: { from: ctx.state, to: target },
        },
      ];

      if (
        ctx.hasOpenSession &&
        (ctx.hasOrders || ctx.hasUnpaidBill) &&
        (target === "free" || target === "needs_cleaning")
      ) {
        effects.push({
          kind: "audit",
          action: "table.manual_set_refused",
          detail: { from: ctx.state, to: target, reason: "unpaid" },
        });
        return { state: ctx.state, changed: false, effects };
      }

      if (target === ctx.state && target !== "free") {
        return { state: ctx.state, changed: false, effects };
      }

      if (target === "free") {
        if (ctx.hasOpenSession) {
          effects.push(closeSession("VOID", event.at), { kind: "cancelOpenTasks" });
        }
        return move("free", effects);
      }

      if (!ctx.hasOpenSession) {
        effects.push({
          kind: "openSession",
          deadlineAt:
            target === "occupied" ? deadlineFrom(event.at, settings.DECIDE_WINDOW_S) : null,
        });
      }

      return move(target, effects);
    }
  }
}

export function isActiveState(state: TableState): boolean {
  return ACTIVE_TABLE_STATES.includes(state);
}

export const nextTableState = transition;
