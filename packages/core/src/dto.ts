import type { BillTotals } from "./billing";
import type { Settings } from "./settings";

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

export type BillLineDto = {
  id: string;
  orderId: string;
  kotNumber: number;
  name: string;
  variant: string;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  note: string | null;
  orderStatus: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
};

export type BillAdjustmentDto = {
  id: string;
  kind: "EXTRA" | "DISCOUNT";
  label: string;
  amountPaise: number;
  percent: number | null;
  createdAt: string;
};

export type BillPaymentDto = {
  id: string;
  method: "CASH" | "UPI" | "CARD";
  amountPaise: number;
  createdAt: string;
};

export type BillRecordDto = {
  id: string;
  billNumber: string;
  status: "OPEN" | "PAID" | "VOID";
  taxRatePercent: number;
  taxInclusive: boolean;
  paidAt: string | null;
  totals: BillTotals;
  adjustments: BillAdjustmentDto[];
  payments: BillPaymentDto[];
};

export type QuickExtraDto = {
  variantId: string;
  name: string;
  variant: string;
  pricePaise: number;
};

export type BillViewDto = {
  sessionId: string;
  kind: "DINE_IN" | "TAKEAWAY";
  state: string;
  openedAt: string;
  closedAt: string | null;
  table: { id: string; label: string; zoneName: string; isAc: boolean } | null;
  items: BillLineDto[];
  bill: BillRecordDto | null;
  draft: BillTotals;
  taxRatePercent: number;
  taxInclusive: boolean;
  billRequested: boolean;
  quickExtras: QuickExtraDto[];
  restaurant: {
    name: string;
    address: string;
    phone: string | null;
    gstin: string | null;
    billFooter: string | null;
  };
};

export type OpenBillRowDto = {
  sessionId: string;
  kind: "DINE_IN" | "TAKEAWAY";
  state: string;
  tableLabel: string | null;
  zoneName: string | null;
  isAc: boolean;
  openedAt: string;
  itemCount: number;
  totalPaise: number;
  billStatus: "OPEN" | "PAID" | "VOID" | null;
  billNumber: string | null;
  billRequested: boolean;
  escalatedTasks: number;
};

export type AdminVariantPriceDto = {
  zoneId: string;
  pricePaise: number;
  available: boolean;
};

export type AdminVariantDto = {
  id: string;
  label: string;
  prices: AdminVariantPriceDto[];
};

export type AdminItemDto = {
  id: string;
  categoryId: string;
  name: string;
  nameLocal: string | null;
  isVeg: boolean;
  needsKitchen: boolean;
  available: boolean;
  active: boolean;
  sort: number;
  variants: AdminVariantDto[];
};

export type AdminCategoryDto = {
  id: string;
  name: string;
  sort: number;
  items: AdminItemDto[];
};

export type AdminZoneDto = {
  id: string;
  name: string;
  isAc: boolean;
  surchargeType: "NONE" | "FLAT" | "PERCENT";
  surchargeValue: number;
  sort: number;
};

export type AdminMenuDto = {
  zones: AdminZoneDto[];
  categories: AdminCategoryDto[];
};

export type AdminTableDto = {
  id: string;
  zoneId: string;
  label: string;
  seats: number;
  cameraId: string | null;
  active: boolean;
  state: string;
};

export type AdminFloorsDto = {
  zones: Array<AdminZoneDto & { tables: AdminTableDto[] }>;
  cameras: Array<{ id: string; name: string; zoneId: string }>;
};

export type AdminStaffDto = {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  hasPin: boolean;
  hasPassword: boolean;
};

export type AdminSettingsDto = {
  settings: Settings;
  restaurant: {
    name: string;
    address: string;
    phone: string | null;
    gstin: string | null;
    billFooter: string | null;
  };
};

export type ReportDishDto = {
  name: string;
  variant: string;
  qty: number;
  amountPaise: number;
};

export type ReportFloorDto = {
  zoneName: string;
  isAc: boolean;
  earningsPaise: number;
  billsCount: number;
};

export type ReportHourDto = {
  hour: number;
  earningsPaise: number;
  billsCount: number;
};

export type ReportPaymentDto = {
  method: string;
  amountPaise: number;
  count: number;
};

export type ReportSummaryDto = {
  from: string;
  to: string;
  rangeStart: string;
  rangeEnd: string;
  earningsPaise: number;
  billsCount: number;
  averageBillPaise: number;
  ordersCount: number;
  itemsCount: number;
  topDishes: ReportDishDto[];
  bottomDishes: ReportDishDto[];
  byFloor: ReportFloorDto[];
  byHour: ReportHourDto[];
  byPayment: ReportPaymentDto[];
  operations: {
    avgSeatedToFirstOrderS: number | null;
    avgOrderToReadyS: number | null;
    avgAlertResponseS: number | null;
  };
};

export type AdminCameraDto = {
  id: string;
  name: string;
  zoneId: string;
  zoneName: string;
  status: "UNKNOWN" | "OK" | "DEGRADED" | "OFFLINE";
  fps: number | null;
  lastHeartbeatAt: string | null;
  active: boolean;
  tableCount: number;
  hasRtsp: boolean;
};

export type CameraCalibrationTableDto = {
  id: string;
  label: string;
  cameraId: string | null;
  visionMutedUntil: string | null;
  polygon: number[][] | null;
};

export type CameraCalibrationDto = {
  camera: AdminCameraDto;
  tables: CameraCalibrationTableDto[];
};

export type VisionDetectionDto = {
  id: string;
  eventId: string;
  tableId: string | null;
  tableLabel: string | null;
  cameraId: string | null;
  cameraName: string | null;
  state: string;
  personCount: number;
  confidence: number;
  ts: string;
  receivedAt: string;
};

export type TuningResponseDto = {
  columns: string[];
  rows: Array<Record<string, string>>;
};
