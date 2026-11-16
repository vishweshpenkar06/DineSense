import type { StreamStatus } from "@/lib/live";

export function ConnectionBadge({ status }: { status: StreamStatus }) {
  const live = status === "live";
  const connecting = status === "connecting";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        live
          ? "border-jade/25 bg-jade/10 text-jade"
          : connecting
            ? "border-accent/25 bg-accent/10 text-accent"
            : "border-coral/30 bg-coral/10 text-coral"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          live ? "bg-jade" : connecting ? "animate-pulse bg-accent" : "animate-pulse bg-coral"
        }`}
      />
      {live ? "Live" : connecting ? "Connecting" : "Reconnecting"}
    </span>
  );
}
