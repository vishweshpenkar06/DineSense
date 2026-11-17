import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "./button";

export type IconButtonProps = Omit<ButtonProps, "children" | "asChild"> & {
  label: string;
  icon: React.ReactNode;
  size?: "md" | "lg";
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, icon, variant = "secondary", size = "md", loading, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      className={cn(
        buttonVariants({ variant, size: size === "lg" ? "lg" : "md" }),
        "aspect-square px-0",
        size === "lg" ? "h-12 w-12 min-h-12" : "h-10 w-10 min-h-10",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
    </button>
  ),
);
IconButton.displayName = "IconButton";

export { IconButton };
