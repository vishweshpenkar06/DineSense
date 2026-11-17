import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-12 w-full rounded-control border border-border bg-card px-3 py-2 text-base text-foreground shadow-card outline-none transition-colors placeholder:text-muted-foreground",
        "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-needs-order",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
