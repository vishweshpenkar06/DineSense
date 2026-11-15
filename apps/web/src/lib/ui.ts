import type { TableState } from "@dinesense/core";

export const STATE_LABEL: Record<TableState, string> = {
  free: "Free",
  occupied: "Seated",
  needs_order: "Waiting to order",
  ordered: "Ordered",
  food_ready: "Food ready",
  dining: "Dining",
  bill_requested: "Bill requested",
  needs_cleaning: "Needs cleaning",
};

export const STATE_STYLE: Record<TableState, string> = {
  free: "border-emerald-500/30 bg-emerald-500/5",
  occupied: "border-amber-400/40 bg-amber-400/10",
  needs_order: "border-red-500/60 bg-red-500/15",
  ordered: "border-sky-500/40 bg-sky-500/10",
  food_ready: "border-violet-500/40 bg-violet-500/10",
  dining: "border-slate-600/60 bg-slate-800/40",
  bill_requested: "border-orange-500/40 bg-orange-500/10",
  needs_cleaning: "border-zinc-500/50 bg-zinc-500/10",
};

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  return `${Math.floor(clamped / 60)}:${(clamped % 60).toString().padStart(2, "0")}`;
}

export function ageSeconds(iso: string, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
}

export function elapsedLabel(iso: string, nowMs: number): string {
  const seconds = ageSeconds(iso, nowMs);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function istClock(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export function homeForRole(role: string): string {
  if (role === "WAITER") return "/waiter";
  if (role === "CHEF") return "/chef";
  return "/dev";
}
