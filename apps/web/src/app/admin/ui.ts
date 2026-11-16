export const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-slate-600 hover:bg-raised disabled:opacity-40";
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised";
export const INPUT =
  "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50";
export const CARD = "rounded-2xl border border-line bg-surface p-4";

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
