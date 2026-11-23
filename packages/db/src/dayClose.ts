import {
  businessDateRange,
  businessDateString,
  type DayCloseDto,
} from "@dinesense/core";
import { prisma } from "./client";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { loadSettings } from "./settings";

async function computeExpected(businessDay: string): Promise<{
  from: string;
  to: string;
  startUtc: Date;
  expectedCashPaise: number;
  expectedUpiPaise: number;
  expectedCardPaise: number;
}> {
  const settings = await loadSettings();
  const range = businessDateRange(businessDay, businessDay, settings.BUSINESS_DAY_START);
  const bills = await prisma.bill.findMany({
    where: { status: "PAID", paidAt: { gte: range.startUtc, lt: range.endUtc } },
    include: { payments: true },
  });
  let expectedCashPaise = 0;
  let expectedUpiPaise = 0;
  let expectedCardPaise = 0;
  for (const bill of bills) {
    for (const payment of bill.payments) {
      if (payment.method === "CASH") expectedCashPaise += payment.amountPaise;
      else if (payment.method === "UPI") expectedUpiPaise += payment.amountPaise;
      else expectedCardPaise += payment.amountPaise;
    }
  }
  return { from: range.from, to: range.to, startUtc: range.startUtc, expectedCashPaise, expectedUpiPaise, expectedCardPaise };
}

export async function getDayClose(date?: string | null): Promise<DayCloseDto> {
  const settings = await loadSettings();
  const businessDay = date ?? businessDateString(new Date(), settings.BUSINESS_DAY_START);
  const expected = await computeExpected(businessDay);
  const close = await prisma.dayClose.findUnique({ where: { businessDay: expected.startUtc } });
  return {
    businessDay: expected.from,
    expectedCashPaise: expected.expectedCashPaise,
    expectedUpiPaise: expected.expectedUpiPaise,
    expectedCardPaise: expected.expectedCardPaise,
    countedCashPaise: close?.countedCashPaise ?? 0,
    variancePaise: close?.variancePaise ?? 0,
    note: close?.note ?? null,
    closedAt: close?.createdAt.toISOString() ?? null,
    closedById: close?.closedById ?? null,
  };
}

export async function saveDayClose(input: {
  businessDay: string;
  countedCashPaise: number;
  note?: string | null;
  actorId?: string | null;
}): Promise<DayCloseDto> {
  if (!Number.isFinite(input.countedCashPaise) || input.countedCashPaise < 0) {
    throw new DomainError("Counted cash must be zero or more");
  }
  const settings = await loadSettings();
  const range = businessDateRange(input.businessDay, input.businessDay, settings.BUSINESS_DAY_START);
  const expected = await computeExpected(input.businessDay);
  const variancePaise = Math.round(input.countedCashPaise) - expected.expectedCashPaise;
  await prisma.$transaction(async (tx) => {
    await tx.dayClose.upsert({
      where: { businessDay: range.startUtc },
      create: {
        businessDay: range.startUtc,
        expectedCashPaise: expected.expectedCashPaise,
        expectedUpiPaise: expected.expectedUpiPaise,
        expectedCardPaise: expected.expectedCardPaise,
        countedCashPaise: Math.round(input.countedCashPaise),
        variancePaise,
        note: input.note?.trim() || null,
        closedById: input.actorId ?? null,
      },
      update: {
        expectedCashPaise: expected.expectedCashPaise,
        expectedUpiPaise: expected.expectedUpiPaise,
        expectedCardPaise: expected.expectedCardPaise,
        countedCashPaise: Math.round(input.countedCashPaise),
        variancePaise,
        note: input.note?.trim() || null,
        closedById: input.actorId ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "day_close.saved",
        entity: "day_close",
        entityId: expected.from,
        detail: {
          countedCashPaise: Math.round(input.countedCashPaise),
          variancePaise,
        },
      },
    });
  });
  await notify("bill.updated", { reason: "day-close" });
  return getDayClose(input.businessDay);
}
