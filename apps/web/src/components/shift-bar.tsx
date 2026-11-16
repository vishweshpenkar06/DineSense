"use client";

import { Check, Volume2 } from "lucide-react";

export function ShiftBar({
  unlocked,
  screenAwake,
  onStart,
}: {
  unlocked: boolean;
  screenAwake: boolean;
  onStart: () => void;
}) {
  if (unlocked && screenAwake) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-jade/20 bg-jade/[0.07] px-2.5 py-1 text-[11px] font-medium text-jade">
        <Check className="h-3 w-3" /> Sound on · awake
      </div>
    );
  }
  if (unlocked) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-medium text-accent"
      >
        <Volume2 className="h-3 w-3" /> Keep screen awake
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex w-full items-center gap-3 rounded-2xl border border-accent/35 bg-accent/[0.08] px-4 py-3 text-left transition hover:bg-accent/[0.12]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-canvas">
        <Volume2 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Start your shift</span>
        <span className="block text-xs text-muted">Turn on alerts, vibration and keep this screen awake.</span>
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-accent">Enable</span>
    </button>
  );
}
