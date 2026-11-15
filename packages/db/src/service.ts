import type {
  KitchenTicketDto,
  KitchenTicketItemDto,
  MenuCategoryDto,
  MenuItemDto,
  MenuResponse,
  MenuVariantDto,
  OrderContextResponse,
  StockVariantDto,
} from "@dinesense/core";
import { taskText, type Settings } from "@dinesense/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { ConflictError, DomainError, NotFoundError } from "./errors";
import { applyTableEventTx, emitApplied, type ApplyResult } from "./engine";
import { notify } from "./notify";
import { loadSettings } from "./settings";

const OPEN_TASK_STATUSES = ["OPEN", "ACK", "SNOOZED"] as const;

export async function defaultZoneId(): Promise<string> {
  const zone = await prisma.zone.findFirst({ orderBy: { sort: "asc" }, select: { id: true } });
  if (!zone) throw new NotFoundError("zone");
  return zone.id;
}

export async function getMenuForZone(zoneId: string): Promise<MenuResponse> {
  const zone = await prisma.zone
    .findUnique({ where: { id: zoneId }, select: { id: true, name: true, isAc: true } })
    .catch(() => null);
  if (!zone) throw new NotFoundError("zone");

  const categories = await prisma.category.findMany({
    orderBy: { sort: "asc" },
    include: {
      items: {
        where: { active: true },
        orderBy: { sort: "asc" },
        include: {
          variants: {
            orderBy: { createdAt: "asc" },
            include: { prices: { where: { zoneId } } },
          },
        },
      },
    },
  });

  return {
    zone,
    categories: categories.map(
      (category): MenuCategoryDto => ({
        id: category.id,
        name: category.name,
        items: category.items.map((item): MenuItemDto => {
          const variants: MenuVariantDto[] = item.variants.map((variant) => {
            const price = variant.prices[0];
            return {
              id: variant.id,
              label: variant.label,
              pricePaise: price?.pricePaise ?? null,
              available: Boolean(price?.available),
            };
          });
          return {
            id: item.id,
            name: item.name,
            nameLocal: item.nameLocal,
            isVeg: item.isVeg,
            needsKitchen: item.needsKitchen,
            available: item.available && variants.some((variant) => variant.available),
            variants,
          };
        }),
      }),
    ),
  };
}

export async function getMenuStock(): Promise<{ variants: StockVariantDto[] }> {
  const variants = await prisma.menuVariant.findMany({
    where: { item: { active: true } },
    orderBy: [{ item: { sort: "asc" } }, { createdAt: "asc" }],
    include: {
      item: { select: { name: true, needsKitchen: true } },
      prices: { select: { available: true } },
    },
  });

  return {
    variants: variants.map((variant) => ({
      id: variant.id,
      itemId: variant.itemId,
      itemName: variant.item.name,
      label: variant.label,
      needsKitchen: variant.item.needsKitchen,
      available: variant.prices.length > 0 && variant.prices.every((price) => price.available),
    })),
  };
}

export async function setVariantAvailability(input: {
  variantId: string;
  available: boolean;
  actorId?: string | null;
}): Promise<{ variantId: string; available: boolean }> {
  const updated = await prisma.$transaction(async (tx) => {
    const variant = await tx.menuVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, item: { select: { name: true } }, label: true },
    });
    if (!variant) throw new NotFoundError("menu variant");

    const result = await tx.variantZonePrice.updateMany({
      where: { variantId: input.variantId },
      data: { available: input.available },
    });
    if (result.count === 0) throw new NotFoundError("menu variant price");

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "menu.variant_availability",
        entity: "menu_variant",
        entityId: input.variantId,
        detail: { available: input.available, name: variant.item.name, variant: variant.label },
      },
    });
    return { variantId: variant.id, available: input.available };
  });

  await notify("menu.availability", updated);
  return updated;
}

export async function getKitchenTickets(now = new Date()): Promise<KitchenTicketDto[]> {
  const recentCancel = new Date(now.getTime() - 2 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: { in: ["PLACED", "PREPARING", "READY"] } },
        { status: "CANCELLED", updatedAt: { gte: recentCancel } },
      ],
    },
    orderBy: { placedAt: "asc" },
    include: {
      items: true,
      session: {
        include: {
          table: { include: { zone: { select: { name: true, isAc: true } } } },
          zone: { select: { name: true, isAc: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    const zone = order.session.table?.zone ?? order.session.zone;
    const items: KitchenTicketItemDto[] = order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      variant: item.variantSnapshot,
      qty: item.qty,
      note: item.note,
      cancelled: item.cancelled,
      cancelReason: item.cancelReason,
    }));
    return {
      id: order.id,
      kotNumber: order.kotNumber,
      status: order.status as KitchenTicketDto["status"],
      tableLabel: order.session.table?.label ?? null,
      zoneName: zone?.name ?? null,
      isAc: zone?.isAc ?? false,
      kind: order.session.kind,
      sessionId: order.sessionId,
      placedAt: order.placedAt.toISOString(),
      ageSeconds: Math.max(0, Math.round((now.getTime() - order.placedAt.getTime()) / 1000)),
      note: order.note,
      items,
    };
  });
}

type Actor = { id: string; role: string };

export async function startOrder(orderId: string, actor: Actor): Promise<{ status: string }> {
  const order = await prisma.order
    .findUnique({ where: { id: orderId }, select: { id: true, status: true } })
    .catch(() => null);
  if (!order) throw new NotFoundError("order");
  if (order.status === "PREPARING") return { status: "PREPARING" };
  if (order.status !== "PLACED") {
    throw new ConflictError(`Cannot start a ${order.status.toLowerCase()} ticket`);
  }

  const now = new Date();
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PREPARING", preparingAt: now },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "order.started",
      entity: "order",
      entityId: orderId,
      detail: {},
    },
  });
  await notify("order.updated", { orderId, status: "PREPARING" });
  return { status: "PREPARING" };
}

async function ensureTakeawayReadyTask(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<string | null> {
  const existing = await tx.task.findFirst({
    where: { sessionId, type: "food_ready", status: { in: [...OPEN_TASK_STATUSES] } },
    select: { id: true },
  });
  if (existing) return null;
  const created = await tx.task.create({
    data: {
      type: "food_ready",
      priority: 1,
      sessionId,
      text: "Takeaway order is ready — pick up",
    },
  });
  return created.id;
}

export async function readyOrder(orderId: string, actor: Actor): Promise<{ status: string }> {
  const settings: Settings = await loadSettings();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        session: { include: { table: { include: { zone: true } } } },
      },
    });
    if (!order) throw new NotFoundError("order");
    if (order.status === "READY") {
        return {
        tableId: order.session.tableId,
        applied: null as ApplyResult | null,
        takeawayTaskId: null,
        sessionId: order.sessionId,
      };
    }
    if (order.status !== "PLACED" && order.status !== "PREPARING") {
      throw new ConflictError(`Cannot mark a ${order.status.toLowerCase()} ticket ready`);
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "READY", readyAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "order.ready",
        entity: "order",
        entityId: orderId,
        detail: {},
      },
    });

    if (order.session.tableId) {
      const applied = await applyTableEventTx(tx, {
        tableId: order.session.tableId,
        event: { type: "ORDER_READY", at: now },
        settings,
        actorId: actor.id,
      });
      return {
        tableId: order.session.tableId,
        applied,
        takeawayTaskId: null,
        sessionId: order.sessionId,
      };
    }

    const taskId = await ensureTakeawayReadyTask(tx, order.sessionId);
    return { tableId: null, applied: null as ApplyResult | null, takeawayTaskId: taskId };
  });

  await notify("order.updated", { orderId, status: "READY", tableId: result.tableId });
  if (result.applied) await emitApplied(result.applied);
  if (result.takeawayTaskId) {
    await notify("task.created", { taskIds: [result.takeawayTaskId], sessionId: result.sessionId });
  }
  return { status: "READY" };
}

async function finishSessionService(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actor: Actor,
  now: Date,
  settings: Settings,
): Promise<{ tableId: string | null; applied: ApplyResult | null }> {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, tableId: true, closedAt: true, state: true },
  });
  if (!session || session.closedAt) throw new ConflictError("Visit is not open");

  const remaining = await tx.order.count({
    where: { sessionId, status: { notIn: ["SERVED", "CANCELLED"] } },
  });
  if (remaining > 0) return { tableId: session.tableId, applied: null };

  if (session.tableId) {
    const applied = await applyTableEventTx(tx, {
      tableId: session.tableId,
      event: { type: "ALL_SERVED", at: now },
      settings,
      actorId: actor.id,
    });
    return { tableId: session.tableId, applied };
  }

  await tx.task.updateMany({
    where: { sessionId, type: "food_ready", status: { in: [...OPEN_TASK_STATUSES] } },
    data: { status: "DONE", doneAt: now },
  });
  await tx.session.update({ where: { id: sessionId }, data: { state: "dining" } });
  return { tableId: null, applied: null };
}

export async function serveOrder(orderId: string, actor: Actor): Promise<{ status: string }> {
  const settings = await loadSettings();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, sessionId: true },
    });
    if (!order) throw new NotFoundError("order");
    if (order.status === "CANCELLED") throw new ConflictError("Ticket is cancelled");
    if (order.status !== "READY" && order.status !== "SERVED") {
      throw new ConflictError("Only ready tickets can be served");
    }
    if (order.status === "READY") {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "SERVED", servedAt: now },
      });
    }
    return finishSessionService(tx, order.sessionId, actor, now, settings);
  });

  await notify("order.updated", { orderId, status: "SERVED", tableId: result.tableId });
  if (result.applied) await emitApplied(result.applied);
  return { status: "SERVED" };
}

export async function serveSession(sessionId: string, actor: Actor): Promise<{ served: number }> {
  const ready = await prisma.order.findMany({
    where: { sessionId, status: "READY" },
    select: { id: true },
  });
  for (const order of ready) {
    await serveOrder(order.id, actor);
  }
  if (ready.length === 0) {
    const settings = await loadSettings();
    const now = new Date();
    const result = await prisma.$transaction((tx) =>
      finishSessionService(tx, sessionId, actor, now, settings),
    );
    if (result.applied) await emitApplied(result.applied);
  }
  return { served: ready.length };
}

export async function cancelOrderItem(input: {
  itemId: string;
  reason?: string | null;
  actor: Actor;
}): Promise<{ orderId: string; orderCancelled: boolean }> {
  const now = new Date();
  const reason = input.reason?.trim() ?? "";

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({
      where: { id: input.itemId },
      include: { order: { select: { id: true, status: true, sessionId: true } } },
    });
    if (!item) throw new NotFoundError("order item");
    if (item.cancelled) return { orderId: item.orderId, orderCancelled: false };
    if (item.order.status === "SERVED" || item.order.status === "CANCELLED") {
      throw new ConflictError("This ticket can no longer be changed");
    }

    const started = item.order.status === "PREPARING" || item.order.status === "READY";
    if (started) {
      if (input.actor.role !== "ADMIN" && input.actor.role !== "RECEPTIONIST") {
        throw new DomainError("Only reception or admin can cancel after cooking started", 403);
      }
      if (!reason) throw new DomainError("A reason is required after cooking started");
    } else if (!["ADMIN", "RECEPTIONIST", "WAITER"].includes(input.actor.role)) {
      throw new DomainError("Not allowed to cancel this item", 403);
    }

    await tx.orderItem.update({
      where: { id: input.itemId },
      data: { cancelled: true, cancelReason: reason || null },
    });

    let orderCancelled = false;
    const remaining = await tx.orderItem.count({
      where: { orderId: item.orderId, cancelled: false },
    });
    if (remaining === 0) {
      await tx.order.update({
        where: { id: item.orderId },
        data: { status: "CANCELLED" },
      });
      orderCancelled = true;
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actor.id,
        action: "order_item.cancelled",
        entity: "order_item",
        entityId: input.itemId,
        detail: { orderId: item.orderId, reason: reason || null, wasStarted: started },
      },
    });
    return { orderId: item.orderId, orderCancelled };
  });

  await notify("order.updated", {
    orderId: result.orderId,
    cancelledItem: input.itemId,
    orderCancelled: result.orderCancelled,
  });
  return result;
}

export async function createTakeawaySession(input: {
  zoneId?: string;
  actorId?: string | null;
}): Promise<{ sessionId: string; zoneId: string }> {
  const zoneId = input.zoneId ?? (await defaultZoneId());
  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findUnique({ where: { id: zoneId }, select: { id: true } });
    if (!zone) throw new NotFoundError("zone");
    const created = await tx.session.create({
      data: {
        kind: "TAKEAWAY",
        zoneId,
        tableId: null,
        state: "occupied",
        openedBy: "MANUAL",
        occupiedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "session.takeaway_opened",
        entity: "session",
        entityId: created.id,
        detail: { zoneId },
      },
    });
    return created;
  });
  await notify("order.updated", { sessionId: session.id, reason: "takeaway-opened" });
  return { sessionId: session.id, zoneId };
}

export async function moveSession(input: {
  sessionId: string;
  targetTableId: string;
  actorId?: string | null;
}): Promise<{ tableId: string; state: string }> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: input.sessionId },
      select: { id: true, tableId: true, state: true, closedAt: true },
    });
    if (!session || session.closedAt) throw new ConflictError("Visit is not open");
    if (!session.tableId) throw new ConflictError("Takeaway visits cannot move");
    if (session.tableId === input.targetTableId) {
      return { tableId: session.tableId, state: session.state, changed: false, from: session.tableId };
    }

    const target = await tx.diningTable.findUnique({
      where: { id: input.targetTableId },
      include: { zone: { select: { name: true } } },
    });
    if (!target || !target.active) throw new NotFoundError("table");
    if (target.state !== "free" && target.state !== "needs_cleaning") {
      throw new ConflictError(`${target.label} is not free`);
    }
    const targetOpen = await tx.session.count({
      where: { tableId: target.id, closedAt: null },
    });
    if (targetOpen > 0) throw new ConflictError(`${target.label} already has a visit`);

    await tx.task.updateMany({
      where: { tableId: target.id, type: "clean_table", status: { in: [...OPEN_TASK_STATUSES] } },
      data: { status: "DONE", doneAt: now },
    });
    await tx.session.update({
      where: { id: session.id },
      data: { tableId: target.id },
    });
    await tx.diningTable.update({
      where: { id: session.tableId },
      data: { state: "free" },
    });
    await tx.diningTable.update({
      where: { id: target.id },
      data: { state: session.state },
    });

    const tasks = await tx.task.findMany({
      where: { sessionId: session.id, status: { in: [...OPEN_TASK_STATUSES] } },
      select: { id: true, type: true },
    });
    for (const task of tasks) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          tableId: target.id,
          zoneId: target.zoneId,
          text: taskText(task.type, { tableLabel: target.label, zoneName: target.zone.name }),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "session.moved",
        entity: "session",
        entityId: session.id,
        detail: { from: session.tableId, to: target.id },
      },
    });
    return { tableId: target.id, state: session.state, changed: true, from: session.tableId };
  });

  if (result.changed) {
    await notify("table.updated", { tableId: result.from, state: "free" });
    await notify("table.updated", { tableId: result.tableId, state: result.state });
    await notify("task.updated", { sessionId: input.sessionId, reason: "moved" });
  }
  return { tableId: result.tableId, state: result.state };
}

export async function requestBill(input: {
  sessionId: string;
  actorId?: string | null;
}): Promise<{ state: string }> {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, tableId: true, closedAt: true },
  });
  if (!session || session.closedAt) throw new ConflictError("Visit is not open");
  if (!session.tableId) throw new ConflictError("Takeaway billing arrives with the receptionist app");

  const settings = await loadSettings();
  const result = await prisma.$transaction((tx) =>
    applyTableEventTx(tx, {
      tableId: session.tableId as string,
      event: { type: "BILL_REQUESTED", at: new Date() },
      settings,
      actorId: input.actorId ?? null,
    }),
  );
  await emitApplied(result);
  return { state: result.state };
}

export async function buildOrderContext(input: {
  tableId?: string;
  sessionId?: string;
}): Promise<OrderContextResponse> {
  let session = null as null | {
    id: string;
    kind: "DINE_IN" | "TAKEAWAY";
    state: string;
    tableId: string | null;
    zoneId: string | null;
    decisionDeadline: Date | null;
  };

  if (input.sessionId) {
    session = await prisma.session.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        kind: true,
        state: true,
        tableId: true,
        zoneId: true,
        decisionDeadline: true,
      },
    });
    if (!session || session.kind !== "TAKEAWAY") throw new NotFoundError("takeaway visit");
  } else if (input.tableId) {
    const row = await prisma.session.findFirst({
      where: { tableId: input.tableId, closedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        state: true,
        tableId: true,
        zoneId: true,
        decisionDeadline: true,
      },
    });
    session = row;
  }

  let table = null as null | {
    id: string;
    label: string;
    seats: number;
    zoneId: string;
    zone: { id: string; name: string; isAc: boolean };
  };
  if (input.tableId) {
    table = await prisma.diningTable.findUnique({
      where: { id: input.tableId },
      select: {
        id: true,
        label: true,
        seats: true,
        zoneId: true,
        zone: { select: { id: true, name: true, isAc: true } },
      },
    });
    if (!table) throw new NotFoundError("table");
  }

  const zoneId = table?.zoneId ?? session?.zoneId;
  if (!zoneId) throw new NotFoundError("zone");

  return {
    kind: table ? "table" : "takeaway",
    zone: table?.zone ?? (await prisma.zone.findUniqueOrThrow({
      where: { id: zoneId },
      select: { id: true, name: true, isAc: true },
    })),
    table: table ? { id: table.id, label: table.label, seats: table.seats } : null,
    session: session
      ? {
          id: session.id,
          kind: session.kind,
          state: session.state,
          tableId: session.tableId,
          decisionDeadline: session.decisionDeadline?.toISOString() ?? null,
        }
      : null,
    menu: await getMenuForZone(zoneId),
  };
}
