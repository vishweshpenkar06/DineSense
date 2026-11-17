import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        neutral: "border-border bg-card-raised text-muted-foreground",
        brand: "border-transparent bg-brand text-brand-foreground",
        success: "border-transparent bg-status-free text-status-free-foreground",
        danger: "border-transparent bg-status-needs-order text-status-needs-order-foreground",
        warning: "border-transparent bg-status-occupied text-status-occupied-foreground",
        info: "border-transparent bg-status-ordered text-status-ordered-foreground",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
