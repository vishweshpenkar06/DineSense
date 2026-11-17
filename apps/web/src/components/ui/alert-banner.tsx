import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  danger: "bg-status-needs-order text-status-needs-order-foreground",
  ready: "bg-status-food-ready text-status-food-ready-foreground",
  warning: "bg-status-occupied text-status-occupied-foreground",
  info: "bg-status-ordered text-status-ordered-foreground",
  success: "bg-status-free text-status-free-foreground",
  neutral: "border border-border bg-card text-foreground",
} as const;

export function AlertBanner({
  tone = "neutral",
  icon: Icon,
  title,
  description,
  action,
  onDismiss,
  className,
}: {
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" || tone === "ready" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-card p-4 shadow-card", TONES[tone], className)}
    >
      {Icon ? <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug">{title}</p>
        {description ? <p className="mt-1 text-sm leading-relaxed opacity-80">{description}</p> : null}
        {action ? <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
