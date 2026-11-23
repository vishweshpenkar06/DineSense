export type TaxMode = "exclusive" | "inclusive";

export type Settings = {
  DECIDE_WINDOW_S: number;
  SEATED_CONFIRM_S: number;
  EMPTY_CONFIRM_S: number;
  SNOOZE_S: number;
  REALERT_S: number;
  ALERT_ESCALATE_S: number;
  VISION_MUTE_S: number;
  TICKET_AMBER_S: number;
  TICKET_RED_S: number;
  VISION_EVENT_RETENTION_DAYS: number;
  SHADOW_MODE: boolean;
  BUSINESS_DAY_START: string;
  TAX_RATE_PERCENT: number;
  SERVICE_CHARGE_PERCENT: number;
  TAX_MODE: TaxMode;
  BILL_NUMBER_PREFIX: string;
};

export const DEFAULT_SETTINGS: Settings = {
  DECIDE_WINDOW_S: 120,
  SEATED_CONFIRM_S: 20,
  EMPTY_CONFIRM_S: 60,
  SNOOZE_S: 300,
  REALERT_S: 60,
  ALERT_ESCALATE_S: 120,
  VISION_MUTE_S: 300,
  TICKET_AMBER_S: 600,
  TICKET_RED_S: 1200,
  VISION_EVENT_RETENTION_DAYS: 30,
  SHADOW_MODE: false,
  BUSINESS_DAY_START: "05:00",
  TAX_RATE_PERCENT: 0,
  SERVICE_CHARGE_PERCENT: 0,
  TAX_MODE: "exclusive",
  BILL_NUMBER_PREFIX: "DS",
};

const NUMERIC_KEYS = [
  "DECIDE_WINDOW_S",
  "SEATED_CONFIRM_S",
  "EMPTY_CONFIRM_S",
  "SNOOZE_S",
  "REALERT_S",
  "ALERT_ESCALATE_S",
  "VISION_MUTE_S",
  "TICKET_AMBER_S",
  "TICKET_RED_S",
  "VISION_EVENT_RETENTION_DAYS",
] as const;

export function mergeSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return merged;

  for (const key of NUMERIC_KEYS) {
    const value = raw[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) merged[key] = Math.floor(parsed);
  }

  const taxRate = raw.TAX_RATE_PERCENT;
  const parsedTax =
    typeof taxRate === "number" ? taxRate : typeof taxRate === "string" ? Number(taxRate) : NaN;
  if (Number.isFinite(parsedTax) && parsedTax >= 0 && parsedTax <= 100) {
    merged.TAX_RATE_PERCENT = Math.round(parsedTax * 100) / 100;
  }

  const serviceCharge = raw.SERVICE_CHARGE_PERCENT;
  const parsedServiceCharge =
    typeof serviceCharge === "number" ? serviceCharge : typeof serviceCharge === "string" ? Number(serviceCharge) : NaN;
  if (Number.isFinite(parsedServiceCharge) && parsedServiceCharge >= 0 && parsedServiceCharge <= 100) {
    merged.SERVICE_CHARGE_PERCENT = Math.round(parsedServiceCharge * 100) / 100;
  }

  const taxMode = raw.TAX_MODE;
  if (taxMode === "inclusive" || taxMode === "exclusive") {
    merged.TAX_MODE = taxMode;
  }

  const shadow = raw.SHADOW_MODE;
  if (typeof shadow === "boolean") {
    merged.SHADOW_MODE = shadow;
  } else if (shadow === "true" || shadow === "false") {
    merged.SHADOW_MODE = shadow === "true";
  }

  const prefix = raw.BILL_NUMBER_PREFIX;
  if (typeof prefix === "string" && /^[A-Za-z0-9]{1,8}$/.test(prefix)) {
    merged.BILL_NUMBER_PREFIX = prefix.toUpperCase();
  }

  const start = raw.BUSINESS_DAY_START;
  if (typeof start === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(start)) {
    merged.BUSINESS_DAY_START = start;
  }

  return merged;
}
