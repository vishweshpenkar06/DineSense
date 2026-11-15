import { addSeconds } from "./stateMachine";
import type { Settings } from "./settings";
import type { TaskStatus, TaskType } from "./types";

export const TASK_PRIORITY: Record<TaskType, number> = {
  food_ready: 1,
  needs_order: 2,
  bill_requested: 3,
  clean_table: 4,
  custom: 4,
};

export type TaskLike = {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  createdAt: Date;
  zoneId?: string | null;
  snoozedUntil?: Date | null;
  lastAlertAt?: Date | null;
  escalatedAt?: Date | null;
  ackAt?: Date | null;
};

const OPEN_STATUSES: TaskStatus[] = ["OPEN", "ACK"];

export function isTaskVisible(task: Pick<TaskLike, "status" | "snoozedUntil">, now: Date): boolean {
  if (OPEN_STATUSES.includes(task.status)) return true;
  if (task.status === "SNOOZED" && task.snoozedUntil) {
    return now.getTime() >= task.snoozedUntil.getTime();
  }
  return false;
}

export function taskText(
  type: TaskType,
  ctx: { tableLabel?: string | null; zoneName?: string | null; customText?: string | null },
): string {
  if (type === "custom") return ctx.customText?.trim() || "Task";
  if (!ctx.tableLabel) {
    switch (type) {
      case "needs_order":
        return "Takeaway order is waiting to be taken";
      case "food_ready":
        return "Takeaway order is ready — pick up";
      case "bill_requested":
        return "Takeaway bill requested";
      case "clean_table":
        return "Takeaway counter needs cleaning";
    }
  }
  const where = ctx.zoneName ? ` (${ctx.zoneName})` : "";
  switch (type) {
    case "needs_order":
      return `Table ${ctx.tableLabel}${where} is waiting to order`;
    case "food_ready":
      return `Table ${ctx.tableLabel}${where} food is ready — pick up`;
    case "bill_requested":
      return `Table ${ctx.tableLabel}${where} requested the bill`;
    case "clean_table":
      return `Table ${ctx.tableLabel}${where} needs cleaning`;
  }
}

function compareTasks(a: TaskLike, b: TaskLike, lastCompletedZoneId?: string | null): number {
  const pa = a.priority || TASK_PRIORITY[a.type];
  const pb = b.priority || TASK_PRIORITY[b.type];
  if (pa !== pb) return pa - pb;

  if (lastCompletedZoneId) {
    const aMatch = a.zoneId === lastCompletedZoneId ? 0 : 1;
    const bMatch = b.zoneId === lastCompletedZoneId ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
  }

  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

export function sortTasks<T extends TaskLike>(tasks: T[], lastCompletedZoneId?: string | null): T[] {
  return [...tasks].sort((a, b) => compareTasks(a, b, lastCompletedZoneId));
}

export function pickNextTask<T extends TaskLike>(
  tasks: T[],
  opts: { now: Date; lastCompletedZoneId?: string | null },
): T | null {
  const visible = tasks.filter((task) => isTaskVisible(task, opts.now));
  if (visible.length === 0) return null;
  return sortTasks(visible, opts.lastCompletedZoneId)[0] ?? null;
}

export function shouldRealert(
  task: Pick<TaskLike, "status" | "lastAlertAt">,
  now: Date,
  settings: Settings,
): boolean {
  if (task.status !== "OPEN") return false;
  const last = task.lastAlertAt?.getTime() ?? 0;
  return now.getTime() >= last + settings.REALERT_S * 1000;
}

export function shouldEscalate(
  task: Pick<TaskLike, "status" | "createdAt" | "escalatedAt">,
  now: Date,
  settings: Settings,
): boolean {
  if (task.escalatedAt) return false;
  if (task.status !== "OPEN" && task.status !== "ACK") return false;
  return now.getTime() >= task.createdAt.getTime() + settings.ALERT_ESCALATE_S * 1000;
}

export function snoozeUntil(now: Date, settings: Settings): Date {
  return addSeconds(now, settings.SNOOZE_S);
}
