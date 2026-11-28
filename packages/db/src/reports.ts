import {
  businessDateRange,
  istDateTimeString,
  istHour,
  resolveReportRange,
  toCsv,
  type ReportDishDto,
  type ReportFloorDto,
  type ReportHourDto,
  type ReportPaymentDto,
  type ReportCorrectionDto,
  type ReportPreset,
  type ReportSummaryDto,
  type ReportTaxLineDto,
} from "@dinesense/core";
import { prisma } from "./client";
import { loadSettings } from "./settings";

export type ReportQuery = {
  preset?: ReportPreset | null;
  from?: string | null;
  to?: string | null;
};

type Range = { from: string; to: string; startUtc: Date; endUtc: Date };

async function resolveRange(query: ReportQuery): Promise<Range> {
  const settings = await loadSettings();
  const business = resolveReportRange(
    query.preset ?? null,
    query.from ?? null,
    query.to ?? null,
    settings.BUSINESS_DAY_START,
  );
  return businessDateRange(business.from, business.to, settings.BUSINESS_DAY_START);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function getReportSummary(query: ReportQuery): Promise<ReportSummaryDto> {
  const range = await resolveRange(query);
  const [bills, orders, sessions, tasks, audits] = await Promise.all([
    prisma.bill.findMany({
      where: { status: "PAID", paidAt: { gte: range.startUtc, lt: range.endUtc } },
      include: {
        payments: true,
        session: {
          include: {
            table: { include: { zone: true } },
            zone: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        placedAt: { gte: range.startUtc, lt: range.endUtc },
        status: { not: "CANCELLED" },
      },
      include: { items: true },
    }),
    prisma.session.findMany({
      where: {
        tableId: { not: null },
        occupiedAt: { gte: range.startUtc, lt: range.endUtc },
        firstOrderAt: { not: null },
      },
      select: { occupiedAt: true, firstOrderAt: true },
    }),
    prisma.task.findMany({
      where: {
        type: "needs_order",
        createdAt: { gte: range.startUtc, lt: range.endUtc },
        OR: [{ ackAt: { not: null } }, { doneAt: { not: null } }],
      },
      select: { createdAt: true, ackAt: true, doneAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        createdAt: { gte: range.startUtc, lt: range.endUtc },
        action: {
          in: ["bill.voided", "bill.reopened", "order_item.cancelled", "table.manual_set"],
        },
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const earningsPaise = bills.reduce((sum, bill) => sum + bill.total, 0);
  const taxPaise = bills.reduce((sum, bill) => sum + bill.cgst + bill.sgst, 0);
  const serviceChargePaise = bills.reduce((sum, bill) => sum + bill.serviceCharge, 0);
  const discountPaise = bills.reduce((sum, bill) => sum + bill.discount, 0);
  const taxRows = new Map<number, ReportTaxLineDto>();
  for (const bill of bills) {
    const stored = Array.isArray(bill.taxBreakup) ? bill.taxBreakup : null;
    if (stored && stored.length > 0) {
      for (const raw of stored) {
        const line = raw as Partial<ReportTaxLineDto>;
        const rate = Number(line.ratePercent ?? 0);
        const row = taxRows.get(rate) ?? { ratePercent: rate, taxablePaise: 0, taxPaise: 0 };
        row.taxablePaise += Number(line.taxablePaise ?? 0);
        row.taxPaise += Number(line.taxPaise ?? 0);
        taxRows.set(rate, row);
      }
    } else {
      const rate = bill.taxRatePercent;
      const row = taxRows.get(rate) ?? { ratePercent: rate, taxablePaise: 0, taxPaise: 0 };
      row.taxablePaise += bill.taxableAmount;
      row.taxPaise += bill.cgst + bill.sgst;
      taxRows.set(rate, row);
    }
  }

  const dishes = new Map<string, ReportDishDto>();
  let itemsCount = 0;
  for (const order of orders) {
    for (const item of order.items) {
      if (item.cancelled) continue;
      itemsCount += item.qty;
      const key = `${item.nameSnapshot}|${item.variantSnapshot}`;
      const row = dishes.get(key) ?? {
        name: item.nameSnapshot,
        variant: item.variantSnapshot,
        qty: 0,
        amountPaise: 0,
      };
      row.qty += item.qty;
      row.amountPaise += item.qty * item.unitPricePaise;
      dishes.set(key, row);
    }
  }
  const dishList = [...dishes.values()].sort(
    (a, b) => b.qty - a.qty || a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant),
  );

  const floors = new Map<string, ReportFloorDto>();
  const hours = new Map<number, ReportHourDto>();
  const payments = new Map<string, ReportPaymentDto>();
  for (const bill of bills) {
    const zone = bill.session.table?.zone ?? bill.session.zone;
    const floorKey = zone?.id ?? "unknown";
    const floor = floors.get(floorKey) ?? {
      zoneName: zone?.name ?? "Takeaway",
      isAc: zone?.isAc ?? false,
      earningsPaise: 0,
      billsCount: 0,
    };
    floor.earningsPaise += bill.total;
    floor.billsCount += 1;
    floors.set(floorKey, floor);

    const hour = istHour(bill.paidAt ?? bill.createdAt);
    const hourRow = hours.get(hour) ?? { hour, earningsPaise: 0, billsCount: 0 };
    hourRow.earningsPaise += bill.total;
    hourRow.billsCount += 1;
    hours.set(hour, hourRow);

    for (const payment of bill.payments) {
      const row = payments.get(payment.method) ?? {
        method: payment.method,
        amountPaise: 0,
        count: 0,
      };
      row.amountPaise += payment.amountPaise;
      row.count += 1;
      payments.set(payment.method, row);
    }
  }

  const seatedToFirst = sessions
    .map((session) =>
      session.firstOrderAt
        ? Math.round((session.firstOrderAt.getTime() - session.occupiedAt.getTime()) / 1000)
        : -1,
    )
    .filter((value) => value >= 0);
  const orderToReady = orders
    .filter((order) => order.readyAt)
    .map((order) => Math.round((order.readyAt!.getTime() - order.placedAt.getTime()) / 1000))
    .filter((value) => value >= 0);
  const alertResponses = tasks
    .map((task) => {
      const answered = task.ackAt ?? task.doneAt;
      return answered ? Math.round((answered.getTime() - task.createdAt.getTime()) / 1000) : -1;
    })
    .filter((value) => value >= 0);

  const corrections: ReportCorrectionDto[] = audits.map((audit) => {
    const detail =
      audit.detail && typeof audit.detail === "object"
        ? (audit.detail as Record<string, unknown>)
        : {};
    const amountPaise = typeof detail.totalPaise === "number" ? detail.totalPaise : 0;
    const reason = typeof detail.reason === "string" ? detail.reason : "";
    const labels: Record<string, string> = {
      "bill.voided": "Bill voided",
      "bill.reopened": "Bill reopened",
      "order_item.cancelled": "Item cancelled",
      "table.manual_set": "Manual table change",
    };
    const kinds: Record<string, ReportCorrectionDto["kind"]> = {
      "bill.voided": "void_bill",
      "bill.reopened": "reopen_bill",
      "order_item.cancelled": "cancel_item",
      "table.manual_set": "manual_set",
    };
    return {
      kind: kinds[audit.action] ?? "manual_set",
      label: labels[audit.action] ?? audit.action,
      amountPaise,
      reason,
      staff: audit.actor?.name ?? "System",
      at: audit.createdAt.toISOString(),
    };
  });

  return {
    from: range.from,
    to: range.to,
    rangeStart: range.startUtc.toISOString(),
    rangeEnd: range.endUtc.toISOString(),
    earningsPaise,
    taxPaise,
    serviceChargePaise,
    discountPaise,
    taxByRate: [...taxRows.values()].sort((a, b) => a.ratePercent - b.ratePercent),
    billsCount: bills.length,
    averageBillPaise: bills.length > 0 ? Math.round(earningsPaise / bills.length) : 0,
    ordersCount: orders.length,
    itemsCount,
    topDishes: dishList.slice(0, 5),
    bottomDishes: [...dishList].reverse().slice(0, 5),
    byFloor: [...floors.values()].sort((a, b) => b.earningsPaise - a.earningsPaise),
    byHour: [...hours.values()].sort((a, b) => a.hour - b.hour),
    byPayment: [...payments.values()].sort((a, b) => b.amountPaise - a.amountPaise),
    corrections,
    operations: {
      avgSeatedToFirstOrderS: average(seatedToFirst),
      avgOrderToReadyS: average(orderToReady),
      avgAlertResponseS: average(alertResponses),
    },
  };
}

export async function getReportCsv(query: ReportQuery): Promise<{ filename: string; csv: string }> {
  const range = await resolveRange(query);
  const bills = await prisma.bill.findMany({
    where: { status: "PAID", paidAt: { gte: range.startUtc, lt: range.endUtc } },
    include: {
      payments: true,
      session: {
        include: {
          orders: { include: { items: true } },
          table: { include: { zone: true } },
          zone: true,
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  const header = [
    "bill_number",
    "paid_at_ist",
    "table",
    "zone",
    "is_ac",
    "item",
    "variant",
    "hsn_code",
    "qty",
    "unit_price_paise",
    "line_total_paise",
    "subtotal_paise",
    "tax_paise",
    "total_paise",
    "payments",
  ];
  const rows: Array<Array<string | number | null>> = [header];

  for (const bill of bills) {
    const zone = bill.session.table?.zone ?? bill.session.zone;
    const paymentSummary = bill.payments
      .map((payment) => `${payment.method}:${payment.amountPaise}`)
      .join("; ");
    const base = [
      bill.billNumber,
      bill.paidAt ? istDateTimeString(bill.paidAt) : "",
      bill.session.table?.label ?? "Parcel",
      zone?.name ?? "Takeaway",
      zone?.isAc ? "Y" : "N",
    ];
    const items = bill.session.orders
      .filter((order) => order.status !== "CANCELLED")
      .flatMap((order) => order.items.filter((item) => !item.cancelled));
    if (items.length === 0) {
      rows.push([...base, "", "", "", "", "", "", bill.subtotal, bill.cgst + bill.sgst, bill.total, paymentSummary]);
      continue;
    }
    for (const item of items) {
      rows.push([
        ...base,
        item.nameSnapshot,
        item.variantSnapshot,
        item.hsnCode ?? "",
        item.qty,
        item.unitPricePaise,
        item.qty * item.unitPricePaise,
        bill.subtotal,
        bill.cgst + bill.sgst,
        bill.total,
        paymentSummary,
      ]);
    }
  }

  const summary = await getReportSummary(query);
  rows.push([]);
  rows.push([], ["Voids and corrections"]);
  rows.push(["kind", "label", "amount_paise", "reason", "staff", "at"]);
  for (const correction of summary.corrections) {
    rows.push([
      correction.kind,
      correction.label,
      correction.amountPaise,
      correction.reason,
      correction.staff,
      correction.at,
    ]);
  }

  return {
    filename: `dinesense-${range.from}-to-${range.to}.csv`,
    csv: toCsv(rows),
  };
}
