import type { StreamStatus } from "@/lib/live";

export function ConnectionBadge({ status }: { status: StreamStatus }) {
  const styles =
    status === "live"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : status === "connecting"
        ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
        : "border-red-500/40 bg-red-500/15 text-red-300";
  const label =
    status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "live"
            ? "bg-emerald-400"
            : status === "connecting"
              ? "bg-amber-300"
              : "bg-red-400"
        }`}
      />
      {label}
    </span>
  );
}
