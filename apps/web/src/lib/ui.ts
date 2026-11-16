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
  free: "border-line bg-surface",
  occupied: "border-accent/25 bg-accent/[0.035]",
  needs_order: "border-coral/35 bg-coral/[0.05]",
  ordered: "border-sky-400/25 bg-sky-400/[0.04]",
  food_ready: "border-iris/35 bg-iris/[0.05]",
  dining: "border-line bg-surface",
  bill_requested: "border-clay/35 bg-clay/[0.05]",
  needs_cleaning: "border-slate-500/25 bg-slate-500/[0.04]",
};

export const STATE_DOT: Record<TableState, string> = {
  free: "bg-jade",
  occupied: "bg-accent",
  needs_order: "bg-coral",
  ordered: "bg-sky-400",
  food_ready: "bg-iris",
  dining: "bg-slate-400",
  bill_requested: "bg-clay",
  needs_cleaning: "bg-slate-500",
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
  if (role === "RECEPTIONIST") return "/reception";
  return "/admin";
}
