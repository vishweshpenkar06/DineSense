import { describe, expect, it } from "vitest";
import {
  applyPayments,
  calculateBill,
  receiptHeading,
  taxRateForRegistration,
  formatBillNumber,
  isBillPaid,
  paidTotal,
  percentOf,
  roundToRupee,
} from "../billing";

describe("rounding and percentages", () => {
  it("rounds to the nearest rupee", () => {
    expect(roundToRupee(32130)).toBe(32100);
    expect(roundToRupee(32150)).toBe(32200);
    expect(roundToRupee(34000)).toBe(34000);
  });

  it("computes percentages in paise", () => {
    expect(percentOf(18000, 10)).toBe(1800);
    expect(percentOf(20200, 5)).toBe(1010);
    expect(percentOf(0, 5)).toBe(0);
  });

  it("formats bill numbers with six digits", () => {
    expect(formatBillNumber("DS", "26-27", 123)).toBe("DS/26-27/00123");
    expect(formatBillNumber("ds", "26-27", 1)).toBe("DS/26-27/00001");
    expect(formatBillNumber("bad prefix!", "26-27", 7)).toBe("DS/26-27/00007");
    expect(formatBillNumber("ABCD", "26-27", 1)).toHaveLength(16);
  });
});

describe("calculateBill", () => {
  it("hand-calculated ground-floor bill with water and a 10% discount", () => {
    const totals = calculateBill({
      items: [
        { qty: 2, unitPricePaise: 9000 },
        { qty: 1, unitPricePaise: 0, cancelled: true },
      ],
      extrasPaise: 4000,
      discountPaise: percentOf(18000, 10),
      taxRatePercent: 5,
      taxInclusive: false,
    });
    expect(totals).toEqual({
      subtotalPaise: 18000,
      extrasPaise: 4000,
      surchargePaise: 0,
      discountPaise: 1800,
      taxableAmountPaise: 20200,
      taxPaise: 1010,
      cgstPaise: 505,
      sgstPaise: 505,
      roundOffPaise: -10,
      totalPaise: 21200,
    });
  });

  it("uses the AC floor's higher snapshotted prices", () => {
    const totals = calculateBill({
      items: [{ qty: 2, unitPricePaise: 10000 }],
      extrasPaise: 4000,
      discountPaise: 2000,
      taxRatePercent: 5,
      taxInclusive: false,
    });
    expect(totals.subtotalPaise).toBe(20000);
    expect(totals.taxableAmountPaise).toBe(22000);
    expect(totals.taxPaise).toBe(1100);
    expect(totals.totalPaise).toBe(23100);
    expect(totals.roundOffPaise).toBe(0);
  });

  it("handles inclusive tax without changing the customer total", () => {
    const totals = calculateBill({
      items: [{ qty: 4, unitPricePaise: 8500 }],
      taxRatePercent: 5,
      taxInclusive: true,
    });
    expect(totals.subtotalPaise).toBe(34000);
    expect(totals.taxableAmountPaise).toBe(32381);
    expect(totals.taxPaise).toBe(1619);
    expect(totals.cgstPaise).toBe(809);
    expect(totals.sgstPaise).toBe(810);
    expect(totals.totalPaise).toBe(34000);
  });

  it("applies flat and percent zone surcharges", () => {
    const flat = calculateBill({
      items: [{ qty: 1, unitPricePaise: 10000 }],
      surchargeType: "FLAT",
      surchargeValue: 2000,
    });
    expect(flat.surchargePaise).toBe(2000);
    expect(flat.taxableAmountPaise).toBe(12000);

    const percent = calculateBill({
      items: [{ qty: 1, unitPricePaise: 10000 }],
      surchargeType: "PERCENT",
      surchargeValue: 5,
    });
    expect(percent.surchargePaise).toBe(500);
    expect(percent.taxableAmountPaise).toBe(10500);
  });

  it("never produces a negative total when the discount is too large", () => {
    const totals = calculateBill({
      items: [{ qty: 1, unitPricePaise: 5000 }],
      discountPaise: 9000,
    });
    expect(totals.taxableAmountPaise).toBe(0);
    expect(totals.totalPaise).toBe(0);
    expect(totals.discountPaise).toBe(9000);
  });


  it("breaks tax out by item rate and taxes service charge at the default rate", () => {
    const totals = calculateBill({
      items: [
        { qty: 1, unitPricePaise: 10000, taxRatePercent: 5 },
        { qty: 1, unitPricePaise: 5000, taxRatePercent: 12 },
      ],
      serviceChargePercent: 10,
      taxRatePercent: 5,
    });
    expect(totals.subtotalPaise).toBe(15000);
    expect(totals.serviceChargePaise).toBe(1500);
    expect(totals.taxableAmountPaise).toBe(16500);
    expect(totals.taxPaise).toBe(1175);
    expect(totals.taxBreakup).toEqual([
      { ratePercent: 5, taxablePaise: 11500, taxPaise: 575, cgstPaise: 287, sgstPaise: 288 },
      { ratePercent: 12, taxablePaise: 5000, taxPaise: 600, cgstPaise: 300, sgstPaise: 300 },
    ]);
    expect(totals.totalPaise).toBe(17700);
    expect(totals.roundOffPaise).toBe(25);
  });

  it("allocates a discount across mixed-rate groups before tax", () => {
    const totals = calculateBill({
      items: [
        { qty: 1, unitPricePaise: 10000, taxRatePercent: 5 },
        { qty: 1, unitPricePaise: 10000, taxRatePercent: 12 },
      ],
      discountPaise: 2000,
      taxRatePercent: 5,
    });
    expect(totals.discountPaise).toBe(2000);
    expect(totals.taxableAmountPaise).toBe(18000);
    expect(totals.taxPaise).toBe(450 + 1080);
    expect(totals.taxBreakup?.map((line) => [line.ratePercent, line.taxablePaise])).toEqual([
      [5, 9000],
      [12, 9000],
    ]);
    expect(totals.totalPaise).toBe(19500);
    expect(totals.roundOffPaise).toBe(-30);
  });

  it("zero tax by default", () => {
    const totals = calculateBill({ items: [{ qty: 3, unitPricePaise: 7000 }] });
    expect(totals.taxPaise).toBe(0);
    expect(totals.totalPaise).toBe(21000);
  });
});

describe("payments", () => {
  it("sums split payments and detects settlement", () => {
    const payments = [{ amountPaise: 11200 }, { amountPaise: 10000 }];
    expect(paidTotal(payments)).toBe(21200);
    expect(isBillPaid(payments, 21200)).toBe(true);
    expect(isBillPaid([{ amountPaise: 10000 }], 21200)).toBe(false);
    expect(isBillPaid([{ amountPaise: 21200 }], 21200)).toBe(true);
  });

  it("stores applied cash and change separately from tendered cash", () => {
    const result = applyPayments([{ method: "CASH", amountPaise: 50000 }], 18000);
    expect(result.payments).toEqual([
      { method: "CASH", tenderedPaise: 50000, appliedPaise: 18000, changePaise: 32000 },
    ]);
    expect(result.paidPaise).toBe(18000);
    expect(result.changePaise).toBe(32000);
  });

  it("applies non-cash first and allocates the remaining cash", () => {
    const result = applyPayments(
      [
        { method: "UPI", amountPaise: 8000 },
        { method: "CASH", amountPaise: 15000 },
      ],
      18000,
    );
    expect(result.payments).toEqual([
      { method: "UPI", tenderedPaise: 8000, appliedPaise: 8000, changePaise: 0 },
      { method: "CASH", tenderedPaise: 15000, appliedPaise: 10000, changePaise: 5000 },
    ]);
    expect(result.changePaise).toBe(5000);
  });

  it("rejects non-cash overpayment and insufficient cash", () => {
    expect(() => applyPayments([{ method: "UPI", amountPaise: 22000 }], 18000)).toThrow(
      /non-cash/i,
    );
    expect(() => applyPayments([{ method: "CASH", amountPaise: 10000 }], 18000)).toThrow(
      /cash/i,
    );
    expect(() =>
      applyPayments(
        [
          { method: "UPI", amountPaise: 18000 },
          { method: "CASH", amountPaise: 1000 },
        ],
        18000,
      ),
    ).toThrow(/cash/i);
  });
});

describe("registration type", () => {
  it("uses the correct issued receipt heading", () => {
    expect(receiptHeading("REGULAR", true)).toBe("Tax Invoice");
    expect(receiptHeading("COMPOSITION", true)).toBe("Bill of Supply");
    expect(receiptHeading("UNREGISTERED", true)).toBe("Bill");
    expect(receiptHeading("REGULAR", false)).toBe("ESTIMATE - not a tax invoice");
  });

  it("forces tax to zero outside REGULAR", () => {
    expect(taxRateForRegistration("REGULAR", 5)).toBe(5);
    expect(taxRateForRegistration("COMPOSITION", 5)).toBe(0);
    expect(taxRateForRegistration("UNREGISTERED", 5)).toBe(0);
  });
});
