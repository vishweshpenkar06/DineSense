import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  className?: string;
}) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : Minus;
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
        <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
        {hint || trend ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  trend.direction === "up" && "text-status-free-foreground",
                  trend.direction === "down" && "text-status-bill-requested-foreground",
                )}
              >
                <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {trend.value}
              </span>
            ) : null}
            {hint ? <span>{hint}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
