import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
        // No success/warning tokens in the set (spec 5.1): a positive state is
        // brass text on second paper, a neutral one muted text on it.
        success: "border-transparent bg-muted text-marketing-accent",
        warning: "border-transparent bg-muted text-muted-foreground",
        brand: "border-transparent bg-muted text-foreground",
        // "Paid" — premium reads as a brass hairline, not an alarm.
        pro: "border-marketing-accent bg-transparent text-marketing-accent",
        accent: "border-transparent bg-accent text-accent-foreground",
        glass: "border-border bg-card text-card-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
