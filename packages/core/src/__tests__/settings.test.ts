import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings";
import { decryptSecret, encryptSecret, hashSecret, safeEqual, verifySecret } from "../security";

describe("settings", () => {
  it("defaults the decision window to 120 seconds", () => {
    expect(DEFAULT_SETTINGS.DECIDE_WINDOW_S).toBe(120);
    expect(DEFAULT_SETTINGS.EMPTY_CONFIRM_S).toBe(60);
    expect(DEFAULT_SETTINGS.BUSINESS_DAY_START).toBe("05:00");
    expect(DEFAULT_SETTINGS.TAX_RATE_PERCENT).toBe(0);
    expect(DEFAULT_SETTINGS.TAX_MODE).toBe("exclusive");
    expect(DEFAULT_SETTINGS.BILL_NUMBER_PREFIX).toBe("DS");
    expect(DEFAULT_SETTINGS.SHADOW_MODE).toBe(false);
  });

  it("merges database overrides over defaults", () => {
    const settings = mergeSettings({ DECIDE_WINDOW_S: 240, BUSINESS_DAY_START: "04:30" });
    expect(settings.DECIDE_WINDOW_S).toBe(240);
    expect(settings.BUSINESS_DAY_START).toBe("04:30");
    expect(settings.REALERT_S).toBe(60);
  });

  it("ignores invalid values", () => {
    const settings = mergeSettings({
      DECIDE_WINDOW_S: -5,
      SNOOZE_S: "abc",
      BUSINESS_DAY_START: "25:00",
    });
    expect(settings.DECIDE_WINDOW_S).toBe(120);
    expect(settings.SNOOZE_S).toBe(300);
    expect(settings.BUSINESS_DAY_START).toBe("05:00");
  });

  it("accepts numeric strings from JSON settings", () => {
    expect(mergeSettings({ DECIDE_WINDOW_S: "200" }).DECIDE_WINDOW_S).toBe(200);
  });

  it("accepts tax settings including a zero rate", () => {
    const settings = mergeSettings({
      TAX_RATE_PERCENT: 5,
      TAX_MODE: "inclusive",
      BILL_NUMBER_PREFIX: "rest",
    });
    expect(settings.TAX_RATE_PERCENT).toBe(5);
    expect(settings.TAX_MODE).toBe("inclusive");
    expect(settings.BILL_NUMBER_PREFIX).toBe("REST");
    expect(mergeSettings({ TAX_RATE_PERCENT: 0 }).TAX_RATE_PERCENT).toBe(0);
  });

  it("accepts the shadow-mode flag", () => {
    expect(mergeSettings({ SHADOW_MODE: true }).SHADOW_MODE).toBe(true);
    expect(mergeSettings({ SHADOW_MODE: "false" }).SHADOW_MODE).toBe(false);
    expect(mergeSettings({ SHADOW_MODE: "x" }).SHADOW_MODE).toBe(false);
  });

  it("ignores invalid tax settings", () => {
    const settings = mergeSettings({
      TAX_RATE_PERCENT: 101,
      TAX_MODE: "sideways",
      BILL_NUMBER_PREFIX: "bad prefix!",
    });
    expect(settings.TAX_RATE_PERCENT).toBe(0);
    expect(settings.TAX_MODE).toBe("exclusive");
    expect(settings.BILL_NUMBER_PREFIX).toBe("DS");
  });
});

describe("security", () => {
  it("hashes and verifies PINs", () => {
    const stored = hashSecret("1111");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(verifySecret("1111", stored)).toBe(true);
    expect(verifySecret("2222", stored)).toBe(false);
    expect(verifySecret("1111", null)).toBe(false);
  });

  it("uses a fresh salt for every hash", () => {
    expect(hashSecret("1111")).not.toBe(hashSecret("1111"));
  });

  it("round-trips RTSP credentials with AES-GCM", () => {
    const url = "rtsp://admin:secret@192.168.1.50:554/stream1";
    const encrypted = encryptSecret(url, "test-key");
    expect(encrypted).not.toContain("secret");
    expect(decryptSecret(encrypted, "test-key")).toBe(url);
    expect(() => decryptSecret(encrypted, "wrong-key")).toThrow();
  });

  it("compares shared secrets without leaking length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
