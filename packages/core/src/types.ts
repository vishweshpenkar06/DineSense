export type TableState =
  | "free"
  | "occupied"
  | "needs_order"
  | "ordered"
  | "food_ready"
  | "dining"
  | "bill_requested"
  | "needs_cleaning";

export const TABLE_STATES: readonly TableState[] = [
  "free",
  "occupied",
  "needs_order",
  "ordered",
  "food_ready",
  "dining",
  "bill_requested",
  "needs_cleaning",
];

export const ACTIVE_TABLE_STATES: readonly TableState[] = [
  "occupied",
  "needs_order",
  "ordered",
  "food_ready",
  "dining",
  "bill_requested",
];

export type TaskType = "food_ready" | "needs_order" | "bill_requested" | "clean_table" | "custom";

export const TASK_TYPES: readonly TaskType[] = [
  "food_ready",
  "needs_order",
  "bill_requested",
  "clean_table",
  "custom",
];

export type TaskStatus = "OPEN" | "ACK" | "SNOOZED" | "DONE" | "CANCELLED";

export type StaffRole = "ADMIN" | "RECEPTIONIST" | "WAITER" | "CHEF";

export type SessionCloseReason = "PAID" | "ABANDONED" | "VOID";

export type SessionOpenedBy = "VISION" | "MANUAL";

export type TableEvent =
  | { type: "VISION_OCCUPIED"; at: Date }
  | { type: "VISION_EMPTY"; at: Date }
  | { type: "TIMER_EXPIRED"; at: Date }
  | { type: "ORDER_PLACED"; at: Date }
  | { type: "ORDER_READY"; at: Date }
  | { type: "ALL_SERVED"; at: Date }
  | { type: "BILL_REQUESTED"; at: Date }
  | { type: "BILL_PAID"; at: Date }
  | { type: "CLEANED"; at: Date }
  | { type: "MANUAL_SET"; at: Date; target: TableState };

export type TableContext = {
  state: TableState;
  hasOpenSession: boolean;
  hasOrders: boolean;
  hasUnpaidBill: boolean;
  /** True when the session exists and no first order has been recorded yet. */
  isFirstOrder: boolean;
};

export type Effect =
  | { kind: "openSession"; deadlineAt: Date | null }
  | { kind: "closeSession"; reason: SessionCloseReason; at: Date }
  | { kind: "createTask"; taskType: TaskType; priority: number }
  | { kind: "cancelTasks"; taskType: TaskType }
  | { kind: "completeTasks"; taskType: TaskType }
  | { kind: "cancelOpenTasks" }
  | { kind: "setFirstOrderAt"; at: Date }
  | { kind: "audit"; action: string; detail?: Record<string, unknown> };

export type TransitionResult = {
  state: TableState;
  changed: boolean;
  effects: Effect[];
};
