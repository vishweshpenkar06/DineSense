import { businessDayStart, IST_OFFSET_MS } from "./stateMachine";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseMinutes(value: string): [number, number] {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new RangeError("Business day start must be HH:mm");
  return [Number(match[1]), Number(match[2])];
}

function parseDate(value: string): [number, number, number] {
  const match = DATE_RE.exec(value);
  if (!match) throw new RangeError("Date must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError("Invalid calendar date");
  }
  return [year, month, day];
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function businessDayStartFromDate(date: string, startHHMM: string): Date {
  const [year, month, day] = parseDate(date);
  const [hour, minute] = parseMinutes(startHHMM);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS);
}

export function businessDateString(at: Date, startHHMM: string): string {
  const start = businessDayStart(at, startHHMM);
  const ist = new Date(start.getTime() + IST_OFFSET_MS);
  return formatDate(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

export function shiftBusinessDate(date: string, days: number): string {
  const [year, month, day] = parseDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function businessDateRange(
  from: string,
  to: string,
  startHHMM: string,
  now: Date = new Date(),
): { startUtc: Date; endUtc: Date; from: string; to: string } {
  const today = businessDateString(now, startHHMM);
  if (from > to) throw new RangeError("from must be on or before to");
  if (to > today) throw new RangeError("to cannot be in the future");
  const startUtc = businessDayStartFromDate(from, startHHMM);
  const endUtc = new Date(businessDayStartFromDate(to, startHHMM).getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc, from, to };
}

export type ReportPreset = "today" | "yesterday" | "last7" | "month";

export function resolveReportRange(
  preset: ReportPreset | null,
  from: string | null,
  to: string | null,
  startHHMM: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = businessDateString(now, startHHMM);
  if (preset) {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "yesterday": {
        const yesterday = shiftBusinessDate(today, -1);
        return { from: yesterday, to: yesterday };
      }
      case "last7":
        return { from: shiftBusinessDate(today, -6), to: today };
      case "month":
        return { from: `${today.slice(0, 7)}-01`, to: today };
    }
  }
  if (!from || !to) throw new RangeError("from and to are required");
  parseDate(from);
  parseDate(to);
  return { from, to };
}

export function istDateString(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return formatDate(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

export function istHour(at: Date): number {
  return new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
}

export function istDateTimeString(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const date = formatDate(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
  return `${date} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}
