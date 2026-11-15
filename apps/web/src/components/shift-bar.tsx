"use client";

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
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
        Sound on · screen stays awake
      </div>
    );
  }
  if (unlocked) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200"
      >
        Sound on · tap to keep the screen awake
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="w-full rounded-lg bg-red-500 px-4 py-2.5 text-left text-sm font-semibold text-white shadow-lg shadow-red-900/30"
    >
      Sound is off — tap to start your shift
      <span className="ml-2 text-xs font-normal text-red-100">
        enables alerts, vibration and wake lock
      </span>
    </button>
  );
}
