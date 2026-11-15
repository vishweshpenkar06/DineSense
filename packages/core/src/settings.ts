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
  BUSINESS_DAY_START: string;
};

export const DEFAULT_SETTINGS: Settings = {
  DECIDE_WINDOW_S: 180,
  SEATED_CONFIRM_S: 20,
  EMPTY_CONFIRM_S: 60,
  SNOOZE_S: 300,
  REALERT_S: 60,
  ALERT_ESCALATE_S: 120,
  VISION_MUTE_S: 300,
  TICKET_AMBER_S: 600,
  TICKET_RED_S: 1200,
  BUSINESS_DAY_START: "05:00",
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
] as const;

export function mergeSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return merged;

  for (const key of NUMERIC_KEYS) {
    const value = raw[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) merged[key] = Math.floor(parsed);
  }

  const start = raw.BUSINESS_DAY_START;
  if (typeof start === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(start)) {
    merged.BUSINESS_DAY_START = start;
  }

  return merged;
}
