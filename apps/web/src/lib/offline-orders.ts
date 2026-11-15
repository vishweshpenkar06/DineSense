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

const KEY = "dinesense.pendingOrders.v1";

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

function writePending(orders: PendingOrder[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(orders));
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

export function pendingCount(): number {
  return readPending().length;
}
