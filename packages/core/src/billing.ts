export type SurchargeType = "NONE" | "FLAT" | "PERCENT";

export type BillItemInput = {
  qty: number;
  unitPricePaise: number;
  cancelled?: boolean;
};

export type BillInput = {
  items: BillItemInput[];
  extrasPaise?: number;
  discountPaise?: number;
  surchargeType?: SurchargeType;
  surchargeValue?: number;
  taxRatePercent?: number;
  taxInclusive?: boolean;
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
};

export type PaymentInput = { amountPaise: number };

export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

export function percentOf(basePaise: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((basePaise * percent) / 100);
}

export function calculateBill(input: BillInput): BillTotals {
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

export function formatBillNumber(prefix: string, year: number, sequence: number): string {
  const safePrefix = /^[A-Za-z0-9]{1,8}$/.test(prefix) ? prefix.toUpperCase() : "DS";
  return `${safePrefix}-${year}-${String(Math.max(1, Math.floor(sequence))).padStart(6, "0")}`;
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
