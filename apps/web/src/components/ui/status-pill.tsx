import type { TableState } from "@dinesense/core";
import {
  Armchair,
  BellRing,
  ChefHat,
  Receipt,
  Soup,
  Sparkles,
  Timer,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  TableState,
  { label: string; icon: typeof Armchair; className: string; urgent?: boolean }
> = {
  free: { label: "Free", icon: Armchair, className: "bg-status-free text-status-free-foreground" },
  occupied: {
    label: "Seated",
    icon: Timer,
    className: "bg-status-occupied text-status-occupied-foreground",
  },
  needs_order: {
    label: "Waiting to order",
    icon: BellRing,
    className: "bg-status-needs-order text-status-needs-order-foreground",
    urgent: true,
  },
  ordered: {
    label: "Order placed",
    icon: ChefHat,
    className: "bg-status-ordered text-status-ordered-foreground",
  },
  food_ready: {
    label: "Food ready",
    icon: Utensils,
    className: "bg-status-food-ready text-status-food-ready-foreground",
    urgent: true,
  },
  dining: { label: "Dining", icon: Soup, className: "bg-status-dining text-status-dining-foreground" },
  bill_requested: {
    label: "Bill requested",
    icon: Receipt,
    className: "bg-status-bill-requested text-status-bill-requested-foreground",
  },
  needs_cleaning: {
    label: "Cleaning needed",
    icon: Sparkles,
    className: "bg-status-needs-cleaning text-status-needs-cleaning-foreground",
  },
};

export type StatusPillProps = {
  state: TableState;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

export function StatusPill({ state, size = "md", className, label }: StatusPillProps) {
  const meta = STATUS_META[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-sm",
        size === "lg" && "px-3 py-1.5 text-base",
        meta.className,
        meta.urgent && "animate-pulse-soft",
        className,
      )}
    >
      <Icon
        className={cn(size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4")}
        aria-hidden="true"
      />
      {label ?? meta.label}
    </span>
  );
}

export { STATUS_META };
