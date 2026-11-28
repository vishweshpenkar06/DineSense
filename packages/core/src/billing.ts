export type SurchargeType = "NONE" | "FLAT" | "PERCENT";

export type BillItemInput = {
  qty: number;
  unitPricePaise: number;
  taxRatePercent?: number | null;
  cancelled?: boolean;
};

export type BillInput = {
  items: BillItemInput[];
  extrasPaise?: number;
  discountPaise?: number;
  surchargeType?: SurchargeType;
  surchargeValue?: number;
  taxRatePercent?: number;
  serviceChargePercent?: number;
  taxInclusive?: boolean;
};

export type BillTaxLine = {
  ratePercent: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
};

export type BillTotals = {
  subtotalPaise: number;
  extrasPaise: number;
  surchargePaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  serviceChargePaise?: number;
  taxBreakup?: BillTaxLine[];
};

export type PaymentInput = { amountPaise: number };
export type PaymentTender = { method: "CASH" | "UPI" | "CARD"; amountPaise: number };
export type AppliedPayment = {
  method: "CASH" | "UPI" | "CARD";
  tenderedPaise: number;
  appliedPaise: number;
  changePaise: number;
};

export function applyPayments(
  payments: PaymentTender[],
  totalPaise: number,
): { payments: AppliedPayment[]; paidPaise: number; changePaise: number } {
  const nonCashTotal = payments
    .filter((payment) => payment.method !== "CASH")
    .reduce((sum, payment) => sum + Math.round(payment.amountPaise), 0);
  if (nonCashTotal > totalPaise) {
    throw new RangeError("Non-cash payments cannot exceed the bill total");
  }

  const cashDue = totalPaise - nonCashTotal;
  const cashTendered = payments
    .filter((payment) => payment.method === "CASH")
    .reduce((sum, payment) => sum + Math.round(payment.amountPaise), 0);
  if (cashTendered < cashDue) {
    throw new RangeError("Cash tendered is less than the amount due");
  }

  let remainingCash = cashDue;
  const applied: AppliedPayment[] = payments.map((payment) => {
    const tenderedPaise = Math.round(payment.amountPaise);
    if (!Number.isFinite(tenderedPaise) || tenderedPaise <= 0) {
      throw new RangeError("Payment amounts must be greater than zero");
    }
    if (payment.method === "CASH") {
      if (remainingCash <= 0) {
        throw new RangeError("No cash is due on this bill");
      }
      const appliedPaise = Math.min(tenderedPaise, remainingCash);
      remainingCash -= appliedPaise;
      return {
        method: payment.method,
        tenderedPaise,
        appliedPaise,
        changePaise: tenderedPaise - appliedPaise,
      };
    }
    return {
      method: payment.method,
      tenderedPaise,
      appliedPaise: tenderedPaise,
      changePaise: 0,
    };
  });

  return {
    payments: applied,
    paidPaise: applied.reduce((sum, payment) => sum + payment.appliedPaise, 0),
    changePaise: applied.reduce((sum, payment) => sum + payment.changePaise, 0),
  };
}

export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

export function percentOf(basePaise: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((basePaise * percent) / 100);
}

export function calculateBill(input: BillInput): BillTotals {
  const hasPerItemRates = (input.items ?? []).some(
    (item) => item.taxRatePercent !== undefined && item.taxRatePercent !== null,
  );
  const serviceChargePercent = Math.min(100, Math.max(0, input.serviceChargePercent ?? 0));
  if (hasPerItemRates || serviceChargePercent > 0) {
    return calculateBillWithBreakup(input);
  }

  const subtotalPaise = (input.items ?? []).reduce((sum, item) => {
    if (item.cancelled) return sum;
    if (!Number.isFinite(item.qty) || !Number.isFinite(item.unitPricePaise)) return sum;
    if (item.qty <= 0 || item.unitPricePaise < 0) return sum;
    return sum + Math.round(item.qty * item.unitPricePaise);
  }, 0);

  const extrasPaise = Math.max(0, Math.round(input.extrasPaise ?? 0));
  const discountPaise = Math.max(0, Math.round(input.discountPaise ?? 0));
  const taxRatePercent = Math.min(100, Math.max(0, input.taxRatePercent ?? 0));

  let surchargePaise = 0;
  const surchargeValue = input.surchargeValue ?? 0;
  if (input.surchargeType === "FLAT") {
    surchargePaise = Math.max(0, Math.round(surchargeValue));
  } else if (input.surchargeType === "PERCENT") {
    surchargePaise = percentOf(subtotalPaise, surchargeValue);
  }

  const basePaise = Math.max(
    0,
    subtotalPaise + extrasPaise + surchargePaise - discountPaise,
  );

  let taxableAmountPaise: number;
  let taxPaise: number;
  let unroundedTotalPaise: number;

  if (input.taxInclusive && taxRatePercent > 0) {
    taxableAmountPaise = Math.round((basePaise * 100) / (100 + taxRatePercent));
    taxPaise = basePaise - taxableAmountPaise;
    unroundedTotalPaise = basePaise;
  } else {
    taxableAmountPaise = basePaise;
    taxPaise = percentOf(basePaise, taxRatePercent);
    unroundedTotalPaise = basePaise + taxPaise;
  }

  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;
  const totalPaise = roundToRupee(unroundedTotalPaise);
  const roundOffPaise = totalPaise - unroundedTotalPaise;

  return {
    subtotalPaise,
    extrasPaise,
    surchargePaise,
    discountPaise,
    taxableAmountPaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise,
    totalPaise,
  };
}


function calculateBillWithBreakup(input: BillInput): BillTotals {
  const globalRate = Math.min(100, Math.max(0, input.taxRatePercent ?? 0));
  const serviceChargePercent = Math.min(100, Math.max(0, input.serviceChargePercent ?? 0));
  const groups = new Map<number, number>();
  let subtotalPaise = 0;

  const addGroup = (rate: number, amount: number) => {
    if (amount <= 0) return;
    const safeRate = Math.min(100, Math.max(0, Number.isFinite(rate) ? rate : globalRate));
    groups.set(safeRate, (groups.get(safeRate) ?? 0) + amount);
  };

  for (const item of input.items ?? []) {
    if (item.cancelled) continue;
    if (!Number.isFinite(item.qty) || !Number.isFinite(item.unitPricePaise)) continue;
    if (item.qty <= 0 || item.unitPricePaise < 0) continue;
    const line = Math.round(item.qty * item.unitPricePaise);
    const rate = item.taxRatePercent ?? globalRate;
    subtotalPaise += line;
    addGroup(rate, line);
  }

  const extrasPaise = Math.max(0, Math.round(input.extrasPaise ?? 0));
  const discountPaise = Math.max(0, Math.round(input.discountPaise ?? 0));
  let surchargePaise = 0;
  const surchargeValue = input.surchargeValue ?? 0;
  if (input.surchargeType === "FLAT") {
    surchargePaise = Math.max(0, Math.round(surchargeValue));
  } else if (input.surchargeType === "PERCENT") {
    surchargePaise = percentOf(subtotalPaise, surchargeValue);
  }
  const serviceChargePaise = percentOf(subtotalPaise, serviceChargePercent);

  addGroup(globalRate, extrasPaise);
  addGroup(globalRate, surchargePaise);
  addGroup(globalRate, serviceChargePaise);

  const grossTotal = [...groups.values()].reduce((sum, amount) => sum + amount, 0);
  const effectiveDiscount = Math.min(discountPaise, grossTotal);
  let remainingDiscount = effectiveDiscount;
  const entries = [...groups.entries()];
  const netGroups: Array<[number, number]> = entries.map(([rate, gross], index) => {
    const allocation =
      index === entries.length - 1
        ? remainingDiscount
        : Math.round((effectiveDiscount * gross) / Math.max(1, grossTotal));
    remainingDiscount = Math.max(0, remainingDiscount - allocation);
    return [rate, Math.max(0, gross - allocation)];
  });

  let taxableAmountPaise = 0;
  let taxPaise = 0;
  let unroundedTotalPaise = 0;
  const taxBreakup: BillTaxLine[] = [];
  for (const [rate, net] of netGroups) {
    if (net <= 0 && rate > 0) continue;
    let taxable = net;
    let tax = 0;
    if (input.taxInclusive && rate > 0) {
      taxable = Math.round((net * 100) / (100 + rate));
      tax = net - taxable;
      unroundedTotalPaise += net;
    } else {
      tax = percentOf(net, rate);
      unroundedTotalPaise += net + tax;
    }
    const cgstPaise = Math.floor(tax / 2);
    const sgstPaise = tax - cgstPaise;
    taxableAmountPaise += taxable;
    taxPaise += tax;
    taxBreakup.push({ ratePercent: rate, taxablePaise: taxable, taxPaise: tax, cgstPaise, sgstPaise });
  }

  taxBreakup.sort((a, b) => a.ratePercent - b.ratePercent);
  const totalPaise = roundToRupee(unroundedTotalPaise);
  const roundOffPaise = totalPaise - unroundedTotalPaise;
  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;

  return {
    subtotalPaise,
    extrasPaise,
    surchargePaise,
    discountPaise,
    taxableAmountPaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise,
    totalPaise,
    serviceChargePaise,
    taxBreakup,
  };
}

export function formatBillNumber(prefix: string, financialYear: string, sequence: number): string {
  const safePrefix = /^[A-Za-z0-9]{1,4}$/.test(prefix) ? prefix.toUpperCase() : "DS";
  const safeYear = /^\d{2}-\d{2}$/.test(financialYear) ? financialYear : "00-00";
  return `${safePrefix}/${safeYear}/${String(Math.max(1, Math.floor(sequence))).padStart(5, "0")}`;
}

export function paidTotal(payments: PaymentInput[]): number {
  return payments.reduce(
    (sum, payment) =>
      sum + (Number.isFinite(payment.amountPaise) ? Math.max(0, Math.round(payment.amountPaise)) : 0),
    0,
  );
}

export function isBillPaid(payments: PaymentInput[], totalPaise: number): boolean {
  return paidTotal(payments) >= totalPaise;
}
