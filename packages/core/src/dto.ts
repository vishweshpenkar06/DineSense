import type { StaffRole, TableState, TaskStatus, TaskType } from "./types";

export type SnapshotTable = {
  id: string;
  label: string;
  seats: number;
  state: TableState;
  zone: { id: string; name: string; isAc: boolean };
  cameraId: string | null;
  visionMutedUntil: string | null;
  session: {
    id: string;
    occupiedAt: string;
    decisionDeadline: string | null;
    firstOrderAt: string | null;
    emptyAt: string | null;
  } | null;
};

export type SnapshotTask = {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  text: string;
  tableId: string | null;
  tableLabel: string | null;
  zoneId: string | null;
  zoneName: string | null;
  sessionId: string | null;
  createdAt: string;
  ackAt: string | null;
  snoozedUntil: string | null;
  lastAlertAt: string | null;
  escalatedAt: string | null;
};

export type SnapshotOrderItem = {
  id: string;
  name: string;
  variant: string;
  qty: number;
  unitPricePaise: number;
  note: string | null;
  cancelled: boolean;
};

export type SnapshotOrder = {
  id: string;
  kotNumber: number;
  status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  tableId: string | null;
  tableLabel: string | null;
  zoneName: string | null;
  placedAt: string;
  items: SnapshotOrderItem[];
};

export type SnapshotCamera = {
  id: string;
  name: string;
  zoneName: string;
  status: "UNKNOWN" | "OK" | "DEGRADED" | "OFFLINE";
  lastHeartbeatAt: string | null;
  fps: number | null;
};

export type Snapshot = {
  serverNow: string;
  me: { id: string; name: string; role: StaffRole };
  settings: {
    DECIDE_WINDOW_S: number;
    SEATED_CONFIRM_S: number;
    EMPTY_CONFIRM_S: number;
    SNOOZE_S: number;
    REALERT_S: number;
    ALERT_ESCALATE_S: number;
    VISION_MUTE_S: number;
    TICKET_AMBER_S: number;
    TICKET_RED_S: number;
    BUSINESS_DAY_START: string;
  };
  tables: SnapshotTable[];
  tasks: SnapshotTask[];
  orders: SnapshotOrder[];
  cameras: SnapshotCamera[];
  worker: { lastTick: string | null; healthy: boolean };
};

export type StreamEventName =
  | "table.updated"
  | "task.created"
  | "task.updated"
  | "order.created"
  | "order.updated"
  | "menu.availability"
  | "camera.status"
  | "bill.updated";

export const STREAM_EVENTS: readonly StreamEventName[] = [
  "table.updated",
  "task.created",
  "task.updated",
  "order.created",
  "order.updated",
  "menu.availability",
  "camera.status",
  "bill.updated",
];

export function eventAllowedForRole(role: StaffRole, type: string): boolean {
  if (role === "CHEF") {
    return type.startsWith("order.") || type === "menu.availability" || type === "hello";
  }
  return true;
}

export type MenuVariantDto = {
  id: string;
  label: string;
  pricePaise: number | null;
  available: boolean;
};

export type MenuItemDto = {
  id: string;
  name: string;
  nameLocal: string | null;
  isVeg: boolean;
  needsKitchen: boolean;
  available: boolean;
  variants: MenuVariantDto[];
};

export type MenuCategoryDto = {
  id: string;
  name: string;
  items: MenuItemDto[];
};

export type MenuResponse = {
  zone: { id: string; name: string; isAc: boolean };
  categories: MenuCategoryDto[];
};

export type StockVariantDto = {
  id: string;
  itemId: string;
  itemName: string;
  label: string;
  needsKitchen: boolean;
  available: boolean;
};

export type KitchenTicketItemDto = {
  id: string;
  name: string;
  variant: string;
  qty: number;
  note: string | null;
  cancelled: boolean;
  cancelReason: string | null;
};

export type KitchenTicketDto = {
  id: string;
  kotNumber: number;
  status: "PLACED" | "PREPARING" | "READY" | "CANCELLED";
  tableLabel: string | null;
  zoneName: string | null;
  isAc: boolean;
  kind: "DINE_IN" | "TAKEAWAY";
  sessionId: string;
  placedAt: string;
  ageSeconds: number;
  note: string | null;
  items: KitchenTicketItemDto[];
};

export type OrderContextResponse = {
  kind: "table" | "takeaway";
  zone: { id: string; name: string; isAc: boolean };
  table: { id: string; label: string; seats: number } | null;
  session: {
    id: string;
    kind: "DINE_IN" | "TAKEAWAY";
    state: string;
    tableId: string | null;
    decisionDeadline: string | null;
  } | null;
  menu: MenuResponse;
};
