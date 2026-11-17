"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  size = "md",
  className,
}: {
  options: Array<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-control border border-border bg-card-raised p-1",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              size === "sm" && "min-h-8 px-2 text-xs",
              size === "md" && "min-h-10 px-3 text-sm",
              size === "lg" && "min-h-12 px-4 text-base",
              selected
                ? "bg-brand text-brand-foreground shadow-card"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            {Icon ? <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
