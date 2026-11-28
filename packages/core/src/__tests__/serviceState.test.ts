import { describe, expect, it } from "vitest";
import { deriveServiceState } from "../serviceState";

const t = (status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED") => ({ status });

describe("deriveServiceState", () => {
  it("prefers any ready ticket", () => {
    expect(deriveServiceState([t("PLACED"), t("READY")], false)).toBe("food_ready");
  });

  it("falls back to ordered for live tickets", () => {
    expect(deriveServiceState([t("PLACED"), t("PREPARING")], false)).toBe("ordered");
  });

  it("uses dining or bill_requested after all tickets are served", () => {
    expect(deriveServiceState([t("SERVED"), t("CANCELLED")], false)).toBe("dining");
    expect(deriveServiceState([t("SERVED")], true)).toBe("bill_requested");
  });

  it("returns occupied when no live items remain", () => {
    expect(deriveServiceState([], false)).toBe("occupied");
    expect(deriveServiceState([t("CANCELLED")], true)).toBe("occupied");
  });
});
