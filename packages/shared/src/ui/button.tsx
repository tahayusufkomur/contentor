import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive",
  {
    variants: {
      variant: {
        // Ink on paper; the press scale is the only hover/press motion.
        default: "bg-primary text-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Legacy names, kept for their callers (signup, dashboard, pricing,
        // the admin's AI badge): the same classes as the primary pair.
        brand: "bg-primary text-primary-foreground",
        glass:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-10 px-6",
        xl: "h-12 px-8 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** When loading, show spinner + this text instead of overlaying children. */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      // Slot can't inject a spinner into an arbitrary child; loading only
      // blocks interaction and signals busy.
      return (
        <Slot
          data-slot="button"
          aria-busy={loading || undefined}
          className={cn(
            buttonVariants({ variant, size, className }),
            loading && "pointer-events-none opacity-50",
          )}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        data-slot="button"
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          loadingText ? (
            <>
              <Loader2
                className="animate-spin"
                strokeWidth={3}
                aria-hidden="true"
              />
              {loadingText}
            </>
          ) : (
            <>
              <span className="absolute inset-0 inline-flex items-center justify-center">
                <Loader2
                  className="animate-spin"
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span className="sr-only">Loading</span>
              </span>
              <span
                aria-hidden="true"
                className="invisible inline-flex items-center gap-2"
              >
                {children}
              </span>
            </>
          )
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
