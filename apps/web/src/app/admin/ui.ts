export const BTN =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 disabled:opacity-40";
export const BTN_PRIMARY =
  "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
export const INPUT = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm";
export const CARD = "rounded-xl border border-slate-800 bg-slate-900/60 p-4";

export type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;

export function money(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}
