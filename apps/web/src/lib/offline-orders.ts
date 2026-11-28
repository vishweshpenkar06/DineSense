"use client";

export type PendingOrderItem = { variantId: string; qty: number; note?: string };

export type PendingOrder = {
  clientKey: string;
  tableId?: string;
  sessionId?: string;
  label: string;
  items: PendingOrderItem[];
  note?: string;
  createdAt: string;
};

export type FailedOrder = PendingOrder & {
  reason: string;
  failedAt: string;
};

const KEY = "dinesense.pendingOrders.v1";
const FAILED_KEY = "dinesense.failedOrders.v1";
export const REOPEN_CART_KEY = "dinesense.reopenCart.v1";

function emit(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("dinesense:pending"));
  }
}

export function readPending(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as PendingOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readFailed(): FailedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAILED_KEY) ?? "[]") as FailedOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(orders: PendingOrder[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(orders));
  emit();
}

function writeFailed(orders: FailedOrder[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAILED_KEY, JSON.stringify(orders));
  emit();
}

export function enqueuePending(order: PendingOrder): void {
  const orders = readPending();
  if (orders.some((existing) => existing.clientKey === order.clientKey)) return;
  writePending([...orders, order]);
}

export function removePending(clientKey: string): void {
  writePending(readPending().filter((order) => order.clientKey !== clientKey));
}

export function moveToFailed(order: PendingOrder, reason: string): void {
  writePending(readPending().filter((entry) => entry.clientKey !== order.clientKey));
  const failed: FailedOrder = { ...order, reason, failedAt: new Date().toISOString() };
  writeFailed([...readFailed().filter((entry) => entry.clientKey !== order.clientKey), failed]);
}

export function retryFailed(clientKey: string): void {
  const failed = readFailed().find((entry) => entry.clientKey === clientKey);
  if (!failed) return;
  writeFailed(readFailed().filter((entry) => entry.clientKey !== clientKey));
  enqueuePending(failed);
}

export function removeFailed(clientKey: string): void {
  writeFailed(readFailed().filter((entry) => entry.clientKey !== clientKey));
}

export function reopenFailed(clientKey: string): void {
  const failed = readFailed().find((entry) => entry.clientKey === clientKey);
  if (!failed || typeof window === "undefined") return;
  window.localStorage.setItem(
    REOPEN_CART_KEY,
    JSON.stringify({
      clientKey: failed.clientKey,
      tableId: failed.tableId,
      sessionId: failed.sessionId,
      items: failed.items,
      note: failed.note,
    }),
  );
  removeFailed(clientKey);
}

export function pendingCount(): number {
  return readPending().length;
}

export function failedCount(): number {
  return readFailed().length;
}
