import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "h-4 w-4",
      default: "h-5 w-5",
      lg: "h-8 w-8",
    },
  },
  defaultVariants: { size: "default" },
});

export interface SpinnerProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  /** Screen-reader text. */
  label?: string;
  /** Center in a min-h-[50vh] block (standalone page/section loads). */
  center?: boolean;
}

export function Spinner({
  className,
  size,
  label = "Loading",
  center = false,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      className={cn(
        center
          ? "flex min-h-[50vh] items-center justify-center"
          : "inline-flex",
        "text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Loader2 aria-hidden="true" className={spinnerVariants({ size })} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
