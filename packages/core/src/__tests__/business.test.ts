import { describe, expect, it } from "vitest";
import {
  businessDateRange,
  businessDateString,
  businessDayStartFromDate,
  financialYearLabel,
  resolveReportRange,
  shiftBusinessDate,
} from "../business";

const start = "05:00";

describe("business dates", () => {
  it("assigns 02:00 IST to the previous business day", () => {
    const at = new Date("2026-11-15T20:30:00Z"); // 16 Nov 02:00 IST
    expect(businessDateString(at, start)).toBe("2026-11-15");
  });

  it("rolls the financial year on 1 April IST", () => {
    expect(financialYearLabel(new Date("2026-03-31T18:29:59Z"))).toBe("25-26");
    expect(financialYearLabel(new Date("2026-03-31T18:30:00Z"))).toBe("26-27");
    expect(financialYearLabel(new Date("2026-11-15T10:00:00Z"))).toBe("26-27");
  });

  it("starts a new business date at 05:00 IST", () => {
    expect(businessDateString(new Date("2026-11-15T23:29:59Z"), start)).toBe("2026-11-15");
    expect(businessDateString(new Date("2026-11-15T23:30:00Z"), start)).toBe("2026-11-16");
  });

  it("converts a business date to the correct UTC start", () => {
    expect(businessDayStartFromDate("2026-11-15", start).toISOString()).toBe(
      "2026-11-14T23:30:00.000Z",
    );
  });

  it("builds an exclusive end boundary after the last day", () => {
    const range = businessDateRange("2026-11-15", "2026-11-15", start, new Date("2026-11-16T12:00:00Z"));
    expect(range.startUtc.toISOString()).toBe("2026-11-14T23:30:00.000Z");
    expect(range.endUtc.toISOString()).toBe("2026-11-15T23:30:00.000Z");
  });

  it("rejects future dates and invalid ranges", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(() => businessDateRange("2026-11-20", "2026-11-20", start, now)).toThrow();
    expect(() => businessDateRange("2026-11-16", "2026-11-15", start, now)).toThrow();
  });

  it("shifts dates across month boundaries", () => {
    expect(shiftBusinessDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftBusinessDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("resolves dashboard presets", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(resolveReportRange("today", null, null, start, now)).toEqual({
      from: "2026-11-15",
      to: "2026-11-15",
    });
    expect(resolveReportRange("yesterday", null, null, start, now)).toEqual({
      from: "2026-11-14",
      to: "2026-11-14",
    });
    expect(resolveReportRange("last7", null, null, start, now)).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(resolveReportRange("month", null, null, start, now)).toEqual({
      from: "2026-11-01",
      to: "2026-11-15",
    });
  });
});
