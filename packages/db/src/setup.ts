import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import { ConflictError, NotFoundError } from "./errors";
import { getBillView, payBill } from "./billing";
import { startOrder, readyOrder, serveSession } from "./service";
import { placeOrder } from "./orders";
import { processDueTimers } from "./jobs";
import { notify } from "./notify";
import { setTableStateManually } from "./engine";


export type SetupCounts = {
  zones: number;
  tables: number;
  cameras: number;
  categories: number;
  menuItems: number;
  staff: number;
};

export type SetupStatus = {
  complete: boolean;
  counts: SetupCounts;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  const [setting, zones, tables, cameras, categories, menuItems, staff] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "SETUP_COMPLETE" } }),
    prisma.zone.count(),
    prisma.diningTable.count({ where: { active: true } }),
    prisma.camera.count({ where: { active: true } }),
    prisma.category.count(),
    prisma.menuItem.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true, role: { not: "ADMIN" } } }),
  ]);
  const hasData = zones > 0 && tables > 0 && categories > 0 && staff > 0;
  const complete =
    setting !== null ? Boolean(setting.value) : hasData;
  return {
    complete,
    counts: { zones, tables, cameras, categories, menuItems, staff },
  };
}

export async function completeSetup(actorId?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: "SETUP_COMPLETE" },
      create: { key: "SETUP_COMPLETE", value: true },
      update: { value: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "setup.completed",
        entity: "setting",
        entityId: "SETUP_COMPLETE",
        detail: {},
      },
    });
  });
  await notify("table.updated", { reason: "setup-complete" });
}

export type SetupDemoStep = { label: string; detail: string };
export type SetupDemoResult = { tableLabel: string; steps: SetupDemoStep[] };

async function cleanupDemo(sessionId: string, tableId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({ where: { sessionId } });
    if (bill) {
      await tx.payment.deleteMany({ where: { billId: bill.id } });
      await tx.billAdjustment.deleteMany({ where: { billId: bill.id } });
    }
    await tx.task.deleteMany({
      where: { OR: [{ sessionId }, { tableId, type: "clean_table" }] },
    });
    await tx.orderItem.deleteMany({ where: { order: { sessionId } } });
    await tx.order.deleteMany({ where: { sessionId } });
    if (bill) await tx.bill.delete({ where: { id: bill.id } });
    await tx.session.deleteMany({ where: { id: sessionId } });
    await tx.diningTable.update({ where: { id: tableId }, data: { state: "free" } });
  });
  await notify("table.updated", { tableId, state: "free" });
  await notify("order.updated", { reason: "setup-demo-cleanup" });
}

export async function runSetupDemo(actorId: string | null): Promise<SetupDemoResult> {
  const table = await prisma.diningTable.findFirst({
    where: { active: true, state: "free" },
    include: { zone: true },
    orderBy: { label: "asc" },
  });
  if (!table) throw new ConflictError("No free table is available for the test run");
  const variant = await prisma.menuVariant.findFirst({
    where: {
      item: { active: true, available: true },
      prices: { some: { zoneId: table.zoneId, available: true } },
    },
    include: {
      item: { select: { name: true } },
      prices: { where: { zoneId: table.zoneId } },
    },
  });
  if (!variant) throw new ConflictError("Import a menu with an available price before the test run");

  const steps: SetupDemoStep[] = [];
  let sessionId: string | null = null;
  try {
    await setTableStateManually({
      tableId: table.id,
      target: "occupied",
      actorId,
    });
    const session = await prisma.session.findFirstOrThrow({
      where: { tableId: table.id, closedAt: null },
      orderBy: { createdAt: "desc" },
    });
    sessionId = session.id;
    await prisma.session.update({
      where: { id: session.id },
      data: { decisionDeadline: new Date(Date.now() - 1000) },
    });
    await processDueTimers(new Date());
    steps.push({
      label: "Seated",
      detail: `Table ${table.label} (${table.zone.name}) marked occupied.`,
    });
    steps.push({
      label: "Timer fired",
      detail: "The 3-minute decision alert appeared for the waiter.",
    });

    const order = await placeOrder({
      tableId: table.id,
      items: [{ variantId: variant.id, qty: 1 }],
      clientKey: `setup-${randomUUID()}`,
      placedById: actorId,
    });
    steps.push({
      label: "Order sent",
      detail: `KOT ${order.kotNumber}: ${variant.item.name} (${variant.label}).`,
    });

    await startOrder(order.orderId, { id: actorId ?? "", role: "ADMIN" });
    await readyOrder(order.orderId, { id: actorId ?? "", role: "ADMIN" });
    steps.push({
      label: "Food ready",
      detail: "Chef marked it ready; the waiter got the pickup alert.",
    });

    await serveSession(session.id, { id: actorId ?? "", role: "ADMIN" });
    steps.push({ label: "Served", detail: "The waiter served it; the table is dining." });

    const bill = await getBillView(session.id);
    await payBill({
      sessionId: session.id,
      payments:
        bill.draft.totalPaise > 0
          ? [{ method: "CASH", amountPaise: bill.draft.totalPaise }]
          : [],
      actorId,
    });
    steps.push({
      label: "Bill paid",
      detail: `₹${(bill.draft.totalPaise / 100).toFixed(2)} settled in cash; table moved to cleaning.`,
    });
  } finally {
    if (sessionId) {
      await cleanupDemo(sessionId, table.id);
      steps.push({
        label: "Test data cleaned",
        detail: "The demo order and bill were removed; the table is free again.",
      });
    }
  }

  return { tableLabel: table.label, steps };
}

export async function reopenSetup(actorId?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: "SETUP_COMPLETE" },
      create: { key: "SETUP_COMPLETE", value: false },
      update: { value: false },
    });
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "setup.reopened",
        entity: "setting",
        entityId: "SETUP_COMPLETE",
        detail: {},
      },
    });
  });
  await notify("table.updated", { reason: "setup-reopened" });
}
