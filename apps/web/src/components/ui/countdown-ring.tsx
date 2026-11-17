import { cn } from "@/lib/utils";

function format(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(clamped / 60)}:${(clamped % 60).toString().padStart(2, "0")}`;
}

export function CountdownRing({
  remainingSeconds,
  totalSeconds,
  size = 64,
  tone = "brand",
  label,
  className,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  size?: number;
  tone?: "brand" | "warning" | "danger";
  label?: string;
  className?: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
  const offset = circumference * (1 - progress);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        tone === "brand" && "text-brand",
        tone === "warning" && "text-status-occupied-foreground",
        tone === "danger" && "text-status-needs-order",
        className,
      )}
      aria-label={label ?? `${Math.max(0, Math.ceil(remainingSeconds))} seconds remaining`}
      role="img"
    >
      <svg width={size} height={size} viewBox="0 0 64 64" className="-rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-semibold tabular-nums text-foreground">{format(remainingSeconds)}</span>
      </span>
    </span>
  );
}
