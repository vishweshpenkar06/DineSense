export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="9.5" fill="currentColor" />
      <circle cx="24" cy="7.5" r="3.7" fill="currentColor" opacity="0.72" />
      <circle cx="24" cy="40.5" r="3.7" fill="currentColor" opacity="0.72" />
      <circle cx="7.5" cy="24" r="3.7" fill="currentColor" opacity="0.72" />
      <circle cx="40.5" cy="24" r="3.7" fill="currentColor" opacity="0.72" />
      <circle cx="24" cy="24" r="4.2" fill="#0B0A08" />
    </svg>
  );
}

export function Brand({
  className = "",
  compact = false,
  tone = "ink",
}: {
  className?: string;
  compact?: boolean;
  tone?: "ink" | "accent";
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark className={`${compact ? "h-7 w-7" : "h-9 w-9"} ${tone === "accent" ? "text-accent" : "text-ink"}`} />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.02em] ${
          compact ? "text-xl" : "text-[1.65rem]"
        } ${tone === "accent" ? "text-accent" : "text-ink"}`}
      >
        DineSense
      </span>
    </span>
  );
}
