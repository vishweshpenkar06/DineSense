import {
  IST_OFFSET_MS,
  applyPayments,
  calculateBill,
  financialYearLabel,
  formatBillNumber,
  percentOf,
  taskText,
  type BillAdjustmentDto,
  type BillLineDto,
  type BillPaymentDto,
  type BillRecordDto,
  type BillTotals,
  type BillViewDto,
  type OpenBillRowDto,
  type QuickExtraDto,
  type Settings,
  type SurchargeType,
} from "@dinesense/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { applyTableEventTx, emitApplied, type ApplyResult } from "./engine";
import { ConflictError, DomainError, NotFoundError } from "./errors";
import { notify } from "./notify";
import { loadSettings } from "./settings";

const OPEN_TASK_STATUSES = ["OPEN", "ACK", "SNOOZED"] as const;

type SessionRow = Prisma.SessionGetPayload<{
  include: { table: { include: { zone: true } }; zone: true };
}>;

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;
type AdjustmentRow = Prisma.BillAdjustmentGetPayload<Record<string, never>>;

async function sessionTx(tx: Prisma.TransactionClient, sessionId: string): Promise<SessionRow> {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    include: { table: { include: { zone: true } }, zone: true },
  });
  if (!session) throw new NotFoundError("visit");
  return session;
}

function zoneOf(session: SessionRow) {
  const zone = session.table?.zone ?? session.zone;
  if (!zone) throw new ConflictError("Visit has no price zone");
  return zone;
}

function linesFromOrders(orders: OrderRow[]): BillLineDto[] {
  return orders.flatMap((order) =>
    order.items
      .filter((item) => !item.cancelled)
      .map((item) => ({
        id: item.id,
        orderId: order.id,
        kotNumber: order.kotNumber,
        name: item.nameSnapshot,
        variant: item.variantSnapshot,
        qty: item.qty,
        unitPricePaise: item.unitPricePaise,
        lineTotalPaise: item.qty * item.unitPricePaise,
        taxRatePercent: item.taxRatePercent,
        hsnCode: item.hsnCode,
        note: item.note,
        orderStatus: order.status,
      })),
  );
}

function totalsFor(
  items: BillLineDto[],
  zone: { surchargeType: string; surchargeValue: number },
  adjustments: AdjustmentRow[],
  settings: Settings,
): BillTotals {
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const extrasPaise = adjustments
    .filter((adjustment) => adjustment.kind === "EXTRA")
    .reduce((sum, adjustment) => sum + Math.max(0, adjustment.amountPaise), 0);
  const discountPaise = adjustments
    .filter((adjustment) => adjustment.kind === "DISCOUNT")
    .reduce(
      (sum, adjustment) =>
        sum +
        (adjustment.percent !== null
          ? percentOf(subtotalPaise, adjustment.percent)
          : Math.max(0, adjustment.amountPaise)),
      0,
    );

  return calculateBill({
    items: items.map((item) => ({
      qty: item.qty,
      unitPricePaise: item.unitPricePaise,
      taxRatePercent: item.taxRatePercent,
    })),
    extrasPaise,
    discountPaise,
    surchargeType: zone.surchargeType as SurchargeType,
    surchargeValue: zone.surchargeValue,
    taxRatePercent: settings.TAX_RATE_PERCENT,
    serviceChargePercent: settings.SERVICE_CHARGE_PERCENT,
    taxInclusive: settings.TAX_MODE === "inclusive",
  });
}

function totalsFromBill(bill: {
  subtotal: number;
  extras: number;
  surcharge: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  total: number;
  serviceCharge?: number;
  taxBreakup?: unknown;
}): BillTotals {
  return {
    subtotalPaise: bill.subtotal,
    extrasPaise: bill.extras,
    surchargePaise: bill.surcharge,
    discountPaise: bill.discount,
    taxableAmountPaise: bill.taxableAmount,
    taxPaise: bill.cgst + bill.sgst,
    cgstPaise: bill.cgst,
    sgstPaise: bill.sgst,
    roundOffPaise: bill.roundOff,
    totalPaise: bill.total,
    serviceChargePaise: bill.serviceCharge ?? 0,
    taxBreakup: Array.isArray(bill.taxBreakup) ? (bill.taxBreakup as BillTotals["taxBreakup"]) : undefined,
  };
}

function mapAdjustment(adjustment: AdjustmentRow): BillAdjustmentDto {
  return {
    id: adjustment.id,
    kind: adjustment.kind,
    label: adjustment.label,
    amountPaise: adjustment.amountPaise,
    percent: adjustment.percent,
    createdAt: adjustment.createdAt.toISOString(),
  };
}

function mapPayment(payment: {
  id: string;
  method: string;
  amountPaise: number;
  tenderedPaise: number | null;
  createdAt: Date;
}): BillPaymentDto {
  return {
    id: payment.id,
    method: payment.method as BillPaymentDto["method"],
    amountPaise: payment.amountPaise,
    tenderedPaise: payment.tenderedPaise,
    changePaise: Math.max(0, (payment.tenderedPaise ?? payment.amountPaise) - payment.amountPaise),
    createdAt: payment.createdAt.toISOString(),
  };
}

async function computeCharges(
  tx: Prisma.TransactionClient,
  session: SessionRow,
  settings: Settings,
): Promise<{ totals: BillTotals; items: BillLineDto[]; adjustments: AdjustmentRow[] }> {
  const orders = await tx.order.findMany({
    where: { sessionId: session.id, status: { not: "CANCELLED" } },
    include: { items: true },
    orderBy: { placedAt: "asc" },
  });
  const items = linesFromOrders(orders);
  const bill = await tx.bill.findUnique({
    where: { sessionId: session.id },
    include: { adjustments: true },
  });
  const adjustments = bill?.adjustments ?? [];
  const totals = totalsFor(items, zoneOf(session), adjustments, settings);
  return { totals, items, adjustments };
}

async function persistBill(
  tx: Prisma.TransactionClient,
  billId: string,
  totals: BillTotals,
  settings: Settings,
  adjustments: AdjustmentRow[],
): Promise<void> {
  await tx.bill.update({
    where: { id: billId },
    data: {
      subtotal: totals.subtotalPaise,
      extras: totals.extrasPaise,
      surcharge: totals.surchargePaise,
      discount: totals.discountPaise,
      taxableAmount: totals.taxableAmountPaise,
      cgst: totals.cgstPaise,
      sgst: totals.sgstPaise,
      roundOff: totals.roundOffPaise,
      total: totals.totalPaise,
      serviceCharge: totals.serviceChargePaise ?? 0,
      taxRatePercent: settings.TAX_RATE_PERCENT,
      taxBreakup: totals.taxBreakup ? (totals.taxBreakup as unknown as Prisma.InputJsonValue) : undefined,
      taxInclusive: settings.TAX_MODE === "inclusive",
    },
  });

  for (const adjustment of adjustments) {
    if (adjustment.kind === "DISCOUNT" && adjustment.percent !== null) {
      const amount = percentOf(totals.subtotalPaise, adjustment.percent);
      if (amount !== adjustment.amountPaise) {
        await tx.billAdjustment.update({
          where: { id: adjustment.id },
          data: { amountPaise: amount },
        });
      }
    }
  }
}

async function allocateBillNumber(
  tx: Prisma.TransactionClient,
  settings: Settings,
  now: Date,
): Promise<string> {
  const fy = financialYearLabel(now);
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "FinancialYearBillCounter" ("fy", "value", "updatedAt")
    VALUES (${fy}, 1, NOW())
    ON CONFLICT ("fy") DO UPDATE
      SET "value" = "FinancialYearBillCounter"."value" + 1, "updatedAt" = NOW()
    RETURNING "value"
  `;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error("Could not allocate a bill number");
  return formatBillNumber(settings.BILL_NUMBER_PREFIX, fy, Number(value));
}

async function ensureBillTx(
  tx: Prisma.TransactionClient,
  session: SessionRow,
  settings: Settings,
  now: Date,
): Promise<Prisma.BillGetPayload<Record<string, never>>> {
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${session.id} FOR UPDATE`;
  const existing = await tx.bill.findUnique({ where: { sessionId: session.id } });
  if (existing) return existing;
  if (session.closedAt) throw new ConflictError("Visit is closed and has no bill");

  return tx.bill.create({
    data: {
      sessionId: session.id,
      status: "OPEN",
      taxRatePercent: settings.TAX_RATE_PERCENT,
      taxInclusive: settings.TAX_MODE === "inclusive",
    },
  });
}

async function issueBillInTx(
  tx: Prisma.TransactionClient,
  session: SessionRow,
  settings: Settings,
  now: Date,
  bill: Prisma.BillGetPayload<Record<string, never>>,
): Promise<Prisma.BillGetPayload<Record<string, never>>> {
  if (bill.issuedAt && bill.billNumber) return bill;
  const charges = await computeCharges(tx, session, settings);
  await persistBill(tx, bill.id, charges.totals, settings, charges.adjustments);
  const billNumber = await allocateBillNumber(tx, settings, now);
  return tx.bill.update({
    where: { id: bill.id },
    data: {
      billNumber,
      issuedAt: now,
      linesSnapshot: {
        items: charges.items,
        adjustments: charges.adjustments.map(mapAdjustment),
        totals: charges.totals,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function issueBill(
  sessionId: string,
  actorId?: string | null,
): Promise<BillViewDto> {
  const settings = await loadSettings();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, sessionId);
    let bill = await tx.bill.findUnique({ where: { sessionId: session.id } });
    if (!bill) bill = await ensureBillTx(tx, session, settings, now);
    if (bill.status !== "OPEN") throw new ConflictError("Only open bills can be issued");
    bill = await issueBillInTx(tx, session, settings, now, bill);
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "bill.issued",
        entity: "bill",
        entityId: bill.id,
        detail: { billNumber: bill.billNumber },
      },
    });
  });
  await notify("bill.updated", { sessionId, status: "issued" });
  return getBillView(sessionId, { create: false });
}

async function recalcBillTx(
  tx: Prisma.TransactionClient,
  session: SessionRow,
  settings: Settings,
  actorId?: string | null,
): Promise<void> {
  const bill = await tx.bill.findUnique({ where: { sessionId: session.id } });
  if (!bill || bill.status !== "OPEN" || bill.issuedAt) return;
  const charges = await computeCharges(tx, session, settings);
  await persistBill(tx, bill.id, charges.totals, settings, charges.adjustments);
  if (actorId !== undefined) {
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "bill.recalculated",
        entity: "bill",
        entityId: bill.id,
        detail: { sessionId: session.id },
      },
    });
  }
}

async function quickExtras(
  tx: Prisma.TransactionClient,
  zoneId: string,
): Promise<QuickExtraDto[]> {
  const items = await tx.menuItem.findMany({
    where: { active: true, available: true, needsKitchen: false },
    include: {
      variants: {
        include: { prices: { where: { zoneId } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { sort: "asc" },
  });

  return items.flatMap((item) =>
    item.variants.flatMap((variant) => {
      const price = variant.prices[0];
      if (!price?.available) return [];
      return [
        {
          variantId: variant.id,
          name: item.name,
          variant: variant.label,
          pricePaise: price.pricePaise,
        },
      ];
    }),
  );
}

export async function getBillView(
  sessionId: string,
  options: { create?: boolean } = {},
): Promise<BillViewDto> {
  const settings = await loadSettings();
  const create = options.create ?? false;

  await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, sessionId);
    let bill = await tx.bill.findUnique({ where: { sessionId: session.id } });
    if (!bill) {
      bill = await ensureBillTx(tx, session, settings, new Date());
    }
    if (bill?.status === "OPEN") {
      await recalcBillTx(tx, session, settings);
    }
  });

  return prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, sessionId);
    const bill = await tx.bill.findUnique({
      where: { sessionId: session.id },
      include: {
        adjustments: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    });
    const charges = await computeCharges(tx, session, settings);
    type BillSnapshot = {
      items: BillLineDto[];
      adjustments: BillAdjustmentDto[];
      totals: BillTotals;
    };
    const snapshot =
      bill?.issuedAt && bill.linesSnapshot
        ? (bill.linesSnapshot as unknown as BillSnapshot)
        : null;
    const viewItems = snapshot?.items ?? charges.items;
    const viewAdjustments = snapshot?.adjustments ?? bill?.adjustments.map(mapAdjustment) ?? [];
    const viewTotals =
      snapshot?.totals ??
      (bill ? (bill.status === "OPEN" ? charges.totals : totalsFromBill(bill)) : charges.totals);
    const zone = zoneOf(session);
    const restaurant = await tx.restaurantProfile.findUnique({ where: { id: "default" } });
    const billRequested =
      session.table?.state === "bill_requested" ||
      (await tx.task.count({
        where: {
          sessionId: session.id,
          type: "bill_requested",
          status: { in: [...OPEN_TASK_STATUSES] },
        },
      })) > 0;

    const record: BillRecordDto | null = bill
      ? {
          id: bill.id,
          billNumber: bill.billNumber,
          status: bill.status,
          taxRatePercent: bill.taxRatePercent,
          taxInclusive: bill.taxInclusive,
          issuedAt: bill.issuedAt?.toISOString() ?? null,
          paidAt: bill.paidAt?.toISOString() ?? null,
          totals: viewTotals,
          adjustments: viewAdjustments,
          payments: bill.payments.map(mapPayment),
        }
      : null;

    return {
      sessionId: session.id,
      kind: session.kind,
      state: session.state,
      openedAt: session.occupiedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      table: session.table
        ? {
            id: session.table.id,
            label: session.table.label,
            zoneName: zone.name,
            isAc: zone.isAc,
          }
        : null,
      items: viewItems,
      bill: record,
      draft: record?.totals ?? charges.totals,
      taxRatePercent: record?.taxRatePercent ?? settings.TAX_RATE_PERCENT,
      taxInclusive: record?.taxInclusive ?? settings.TAX_MODE === "inclusive",
      billRequested,
      quickExtras: await quickExtras(tx, zone.id),
      restaurant: {
        name: restaurant?.name ?? "DineSense",
        address: restaurant?.address ?? "",
        phone: restaurant?.phone ?? null,
        gstin: restaurant?.gstin ?? null,
        fssai: restaurant?.fssai ?? null,
        upiId: restaurant?.upiId ?? null,
        upiName: restaurant?.upiName ?? null,
        upiQrUrl: restaurant?.upiQrUrl ?? null,
        billFooter: restaurant?.billFooter ?? null,
      },
    };
  });
}

export async function getOpenBills(): Promise<OpenBillRowDto[]> {
  const settings = await loadSettings();
  const sessions = await prisma.session.findMany({
    where: { closedAt: null },
    include: {
      table: { include: { zone: true } },
      zone: true,
      orders: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true },
      },
      bill: { include: { adjustments: true } },
    },
    orderBy: { occupiedAt: "asc" },
  });
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((session) => session.id);
  const [billTasks, escalatedTasks] = await Promise.all([
    prisma.task.findMany({
      where: {
        sessionId: { in: sessionIds },
        type: "bill_requested",
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      select: { sessionId: true },
    }),
    prisma.task.findMany({
      where: {
        sessionId: { in: sessionIds },
        escalatedAt: { not: null },
        status: { in: ["OPEN", "ACK"] },
      },
      select: { sessionId: true },
    }),
  ]);
  const billRequested = new Set(billTasks.map((task) => task.sessionId));
  const escalated = new Map<string, number>();
  for (const task of escalatedTasks) {
    if (!task.sessionId) continue;
    escalated.set(task.sessionId, (escalated.get(task.sessionId) ?? 0) + 1);
  }

  const rows: OpenBillRowDto[] = sessions.map((session) => {
    const zone = session.table?.zone ?? session.zone;
    const items = linesFromOrders(session.orders as OrderRow[]);
    const totals = totalsFor(items, zone ?? { surchargeType: "NONE", surchargeValue: 0 }, session.bill?.adjustments ?? [], settings);
    return {
      sessionId: session.id,
      kind: session.kind,
      state: session.state,
      tableLabel: session.table?.label ?? null,
      zoneName: zone?.name ?? null,
      isAc: zone?.isAc ?? false,
      openedAt: session.occupiedAt.toISOString(),
      itemCount: items.reduce((sum, item) => sum + item.qty, 0),
      totalPaise: totals.totalPaise,
      billStatus: session.bill?.status ?? null,
      billNumber: session.bill?.billNumber ?? null,
      billRequested: billRequested.has(session.id) || session.table?.state === "bill_requested",
      escalatedTasks: escalated.get(session.id) ?? 0,
    };
  });

  return rows.sort((a, b) => {
    if (a.billRequested !== b.billRequested) return a.billRequested ? -1 : 1;
    if (a.escalatedTasks !== b.escalatedTasks) return b.escalatedTasks - a.escalatedTasks;
    return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });
}

export async function assertBillEditableTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  const bill = await tx.bill.findUnique({ where: { sessionId } });
  if (bill?.issuedAt) {
    throw new ConflictError("Bill is issued. Void it with a reason before changing the order.");
  }
}

export async function addBillAdjustment(input: {
  sessionId: string;
  kind: "EXTRA" | "DISCOUNT";
  label?: string;
  amountPaise?: number;
  percent?: number;
  actorId?: string | null;
}): Promise<BillViewDto> {
  const settings = await loadSettings();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, input.sessionId);
    await assertBillEditableTx(tx, session.id);
    const bill = await ensureBillTx(tx, session, settings, now);
    if (bill.status !== "OPEN") throw new ConflictError(`Bill is ${bill.status.toLowerCase()}`);
    const charges = await computeCharges(tx, session, settings);

    let amountPaise: number;
    let percent: number | null = null;
    let label = input.label?.trim() ?? "";

    if (input.kind === "EXTRA") {
      if (!input.amountPaise || input.amountPaise <= 0) {
        throw new DomainError("Extra amount must be greater than zero");
      }
      amountPaise = Math.round(input.amountPaise);
      if (!label) label = "Extra";
    } else if (input.percent !== undefined) {
      if (!Number.isFinite(input.percent) || input.percent <= 0 || input.percent > 100) {
        throw new DomainError("Discount percent must be between 1 and 100");
      }
      percent = Math.round(input.percent);
      amountPaise = percentOf(charges.totals.subtotalPaise, percent);
      if (!label) label = `Discount ${percent}%`;
    } else {
      if (!input.amountPaise || input.amountPaise <= 0) {
        throw new DomainError("Discount amount must be greater than zero");
      }
      amountPaise = Math.round(input.amountPaise);
      if (!label) label = "Discount";
    }

    await tx.billAdjustment.create({
      data: { billId: bill.id, kind: input.kind, label, amountPaise, percent },
    });
    await recalcBillTx(tx, session, settings);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.kind === "EXTRA" ? "bill.extra_added" : "bill.discount_added",
        entity: "bill",
        entityId: bill.id,
        detail: { label, amountPaise, percent },
      },
    });
  });

  await notify("bill.updated", { sessionId: input.sessionId });
  return getBillView(input.sessionId, { create: false });
}

export async function removeBillAdjustment(input: {
  sessionId: string;
  adjustmentId: string;
  actorId?: string | null;
}): Promise<BillViewDto> {
  const settings = await loadSettings();
  await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, input.sessionId);
    await assertBillEditableTx(tx, session.id);
    const adjustment = await tx.billAdjustment.findUnique({
      where: { id: input.adjustmentId },
      include: { bill: true },
    });
    if (!adjustment || adjustment.bill.sessionId !== session.id) {
      throw new NotFoundError("bill adjustment");
    }
    if (adjustment.bill.status !== "OPEN") {
      throw new ConflictError("Only open bills can be changed");
    }
    await tx.billAdjustment.delete({ where: { id: adjustment.id } });
    await recalcBillTx(tx, session, settings);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "bill.adjustment_removed",
        entity: "bill",
        entityId: adjustment.billId,
        detail: { adjustmentId: adjustment.id, kind: adjustment.kind, amountPaise: adjustment.amountPaise },
      },
    });
  });
  await notify("bill.updated", { sessionId: input.sessionId });
  return getBillView(input.sessionId, { create: false });
}

export async function payBill(input: {
  sessionId: string;
  payments: Array<{ method: "CASH" | "UPI" | "CARD"; amountPaise: number }>;
  actorId?: string | null;
  skipIssue?: boolean;
}): Promise<{ bill: BillViewDto; totalPaise: number; paidPaise: number; changePaise: number }> {
  const settings = await loadSettings();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, input.sessionId);
    let bill = await ensureBillTx(tx, session, settings, now);
    if (bill.status === "PAID") throw new ConflictError("Bill is already paid");
    if (bill.status === "VOID") throw new ConflictError("Bill is void");
    if (!bill.issuedAt && !input.skipIssue) {
      bill = await issueBillInTx(tx, session, settings, now, bill);
    }

    const charges = await computeCharges(tx, session, settings);
    await persistBill(tx, bill.id, charges.totals, settings, charges.adjustments);
    const totalPaise = charges.totals.totalPaise;

    const tenders = input.payments.map((payment) => {
      if (!["CASH", "UPI", "CARD"].includes(payment.method)) {
        throw new DomainError("Unknown payment method");
      }
      const amount = Math.round(payment.amountPaise);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new DomainError("Payment amounts must be greater than zero");
      }
      return { method: payment.method as "CASH" | "UPI" | "CARD", amountPaise: amount };
    });
    if (totalPaise > 0 && tenders.length === 0) {
      throw new DomainError("Add at least one payment");
    }
    let allocation: ReturnType<typeof applyPayments>;
    try {
      allocation = applyPayments(tenders, totalPaise);
    } catch (caught) {
      if (caught instanceof RangeError) throw new DomainError(caught.message);
      throw caught;
    }

    for (const payment of allocation.payments) {
      await tx.payment.create({
        data: {
          billId: bill.id,
          method: payment.method,
          amountPaise: payment.appliedPaise,
          tenderedPaise: payment.tenderedPaise,
        },
      });
    }

    const paidPaise = allocation.paidPaise;
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "PAID", paidAt: now, finalizedById: input.actorId ?? null },
    });

    let applied: ApplyResult | null = null;
    if (session.tableId) {
      applied = await applyTableEventTx(tx, {
        tableId: session.tableId,
        event: { type: "BILL_PAID", at: now },
        settings,
        actorId: input.actorId ?? null,
      });
    } else {
      await tx.session.update({
        where: { id: session.id },
        data: { closedAt: now, closeReason: "PAID" },
      });
      await tx.task.updateMany({
        where: { sessionId: session.id, status: { in: [...OPEN_TASK_STATUSES] } },
        data: { status: "DONE", doneAt: now },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "bill.paid",
        entity: "bill",
        entityId: bill.id,
        detail: { totalPaise, payments: allocation.payments },
      },
    });

    return { applied, totalPaise, paidPaise, changePaise: allocation.changePaise };
  });

  await notify("bill.updated", { sessionId: input.sessionId, status: "PAID" });
  if (result.applied) await emitApplied(result.applied);
  const bill = await getBillView(input.sessionId, { create: false });
  return {
    bill,
    totalPaise: result.totalPaise,
    paidPaise: result.paidPaise,
    changePaise: result.changePaise,
  };
}

export async function voidBill(input: {
  sessionId: string;
  reason: string;
  actorId?: string | null;
}): Promise<{ billId: string; tableId: string | null }> {
  if (!input.reason.trim()) throw new DomainError("A reason is required to void a bill");
  const now = new Date();
  const settings = await loadSettings();

  const result = await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, input.sessionId);
    let bill = await tx.bill.findUnique({ where: { sessionId: session.id } });
    if (!bill) bill = await ensureBillTx(tx, session, settings, now);
    if (bill.status !== "OPEN") throw new ConflictError("Only open bills can be voided");
    const charges = await computeCharges(tx, session, settings);
    await persistBill(tx, bill.id, charges.totals, settings, charges.adjustments);

    await tx.bill.update({ where: { id: bill.id }, data: { status: "VOID" } });
    if (!session.closedAt) {
      await tx.session.update({
        where: { id: session.id },
        data: { closedAt: now, closeReason: "VOID" },
      });
    }
    await tx.orderItem.updateMany({
      where: { order: { sessionId: session.id }, cancelled: false },
      data: { cancelled: true },
    });
    await tx.order.updateMany({
      where: { sessionId: session.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
    await tx.task.updateMany({
      where: { sessionId: session.id, status: { in: [...OPEN_TASK_STATUSES] } },
      data: { status: "CANCELLED" },
    });
    if (session.tableId) {
      await tx.diningTable.update({ where: { id: session.tableId }, data: { state: "free" } });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "bill.voided",
        entity: "bill",
        entityId: bill.id,
        detail: { reason: input.reason.trim(), totalPaise: bill.total },
      },
    });
    return { billId: bill.id, tableId: session.tableId };
  });

  await notify("bill.updated", { sessionId: input.sessionId, status: "VOID" });
  if (result.tableId) await notify("table.updated", { tableId: result.tableId, state: "free" });
  return result;
}

export async function reopenBill(input: {
  sessionId: string;
  reason: string;
  actorId?: string | null;
}): Promise<BillViewDto> {
  if (!input.reason.trim()) throw new DomainError("A reason is required to reopen a bill");
  const settings = await loadSettings();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const session = await sessionTx(tx, input.sessionId);
    const bill = await tx.bill.findUnique({
      where: { sessionId: session.id },
      include: { payments: true },
    });
    if (!bill) throw new NotFoundError("bill");
    if (bill.status !== "PAID") throw new ConflictError("Only paid bills can be reopened");

    if (session.tableId) {
      const openOnTable = await tx.session.count({
        where: { tableId: session.tableId, closedAt: null },
      });
      if (openOnTable > 0) throw new ConflictError("This table has been reseated");
    }

    const previousPayments = bill.payments.map((payment) => ({
      method: payment.method,
      amountPaise: payment.amountPaise,
    }));

    await tx.payment.deleteMany({ where: { billId: bill.id } });
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "OPEN", paidAt: null, finalizedById: null },
    });
    await tx.session.update({
      where: { id: session.id },
      data: { closedAt: null, closeReason: null, state: "bill_requested" },
    });

    if (session.tableId) {
      await tx.diningTable.update({
        where: { id: session.tableId },
        data: { state: "bill_requested" },
      });
      await tx.task.updateMany({
        where: {
          tableId: session.tableId,
          type: "clean_table",
          status: { in: [...OPEN_TASK_STATUSES] },
        },
        data: { status: "CANCELLED" },
      });
      const zoneName = session.table?.zone.name ?? "";
      const existing = await tx.task.findFirst({
        where: { sessionId: session.id, type: "bill_requested", status: { in: [...OPEN_TASK_STATUSES] } },
        select: { id: true },
      });
      if (!existing) {
        await tx.task.create({
          data: {
            type: "bill_requested",
            priority: 3,
            tableId: session.tableId,
            zoneId: session.table?.zoneId ?? null,
            sessionId: session.id,
            text: taskText("bill_requested", {
              tableLabel: session.table?.label,
              zoneName,
            }),
          },
        });
      }
    } else {
      const existing = await tx.task.findFirst({
        where: { sessionId: session.id, type: "bill_requested", status: { in: [...OPEN_TASK_STATUSES] } },
        select: { id: true },
      });
      if (!existing) {
        await tx.task.create({
          data: {
            type: "bill_requested",
            priority: 3,
            sessionId: session.id,
            text: "Takeaway bill requested",
          },
        });
      }
    }

    await recalcBillTx(tx, session, settings);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "bill.reopened",
        entity: "bill",
        entityId: bill.id,
        detail: { reason: input.reason.trim(), previousPayments },
      },
    });
  });

  await notify("bill.updated", { sessionId: input.sessionId, status: "OPEN" });
  await notify("task.created", { sessionId: input.sessionId, reason: "bill-reopened" });
  return getBillView(input.sessionId, { create: false });
}
