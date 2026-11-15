import { businessDayStart } from "@dinesense/core";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { ConflictError, DomainError, NotFoundError } from "./errors";
import { applyTableEventTx, emitApplied, type ApplyResult } from "./engine";
import { notify } from "./notify";
import { loadSettings } from "./settings";

export type OrderItemInput = { variantId: string; qty: number; note?: string | null };

export type PlaceOrderInput = {
  sessionId?: string;
  tableId?: string;
  items: OrderItemInput[];
  clientKey: string;
  note?: string | null;
  placedById?: string | null;
  at?: Date;
};

export type PlaceOrderResult = {
  orderId: string;
  kotNumber: number;
  sessionId: string;
  tableId: string | null;
  duplicate: boolean;
  applied: ApplyResult | null;
};

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!input.items || input.items.length === 0) throw new DomainError("Order must contain at least one item");
  if (!input.clientKey || input.clientKey.length < 8) throw new DomainError("clientKey is required");

  const settings = await loadSettings();
  const at = input.at ?? new Date();

  const existing = await prisma.order.findUnique({
    where: { clientKey: input.clientKey },
    select: { id: true, kotNumber: true, sessionId: true, session: { select: { tableId: true } } },
  });
  if (existing) {
    return {
      orderId: existing.id,
      kotNumber: existing.kotNumber,
      sessionId: existing.sessionId,
      tableId: existing.session.tableId,
      duplicate: true,
      applied: null,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const session = input.sessionId
      ? await tx.session.findUnique({ where: { id: input.sessionId } })
      : input.tableId
        ? await tx.session.findFirst({
            where: { tableId: input.tableId, closedAt: null },
            orderBy: { createdAt: "desc" },
          })
        : null;

    if (!session || session.closedAt) {
      throw new ConflictError("No open visit for this table — seat the table first");
    }
    if (session.kind !== "DINE_IN" || !session.tableId) {
      throw new ConflictError("Takeaway ordering arrives with the waiter app");
    }
    if (session.state === "free" || session.state === "needs_cleaning") {
      throw new ConflictError("This table is not accepting orders");
    }

    const table = await tx.diningTable.findUnique({
      where: { id: session.tableId },
      select: { id: true, zoneId: true },
    });
    if (!table) throw new NotFoundError("table");

    const variantIds = [...new Set(input.items.map((item) => item.variantId))];
    const variants = await tx.menuVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        item: true,
        prices: { where: { zoneId: table.zoneId } },
      },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    const lines = input.items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant) throw new NotFoundError("menu variant");
      if (!variant.item.active || !variant.item.available) {
        throw new ConflictError(`${variant.item.name} is not available`);
      }
      const price = variant.prices[0];
      if (!price || !price.available) {
        throw new ConflictError(`${variant.item.name} (${variant.label}) is unavailable on this floor`);
      }
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 50) {
        throw new DomainError("Quantity must be between 1 and 50");
      }
      return {
        variantId: variant.id,
        nameSnapshot: variant.item.name,
        variantSnapshot: variant.label,
        qty: item.qty,
        unitPricePaise: price.pricePaise,
        note: item.note?.trim() || null,
      };
    });

    const businessDay = businessDayStart(at, settings.BUSINESS_DAY_START);
    const last = await tx.order.aggregate({
      where: { businessDay },
      _max: { kotNumber: true },
    });
    const kotNumber = (last._max.kotNumber ?? 0) + 1;

    const order = await tx.order.create({
      data: {
        sessionId: session.id,
        kotNumber,
        businessDay,
        status: "PLACED",
        placedById: input.placedById ?? null,
        note: input.note?.trim() || null,
        placedAt: at,
        clientKey: input.clientKey,
        items: { create: lines },
      },
    });

    const applied = await applyTableEventTx(tx, {
      tableId: table.id,
      event: { type: "ORDER_PLACED", at },
      settings,
      openedBy: "MANUAL",
      actorId: input.placedById ?? null,
    });

    return { orderId: order.id, kotNumber, sessionId: session.id, tableId: table.id, applied };
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Duplicate order (same clientKey)");
    }
    throw error;
  });

  await notify("order.created", {
    orderId: result.orderId,
    kotNumber: result.kotNumber,
    tableId: result.tableId,
  });
  if (result.applied) await emitApplied(result.applied);

  return {
    orderId: result.orderId,
    kotNumber: result.kotNumber,
    sessionId: result.sessionId,
    tableId: result.tableId,
    duplicate: false,
    applied: result.applied,
  };
}
