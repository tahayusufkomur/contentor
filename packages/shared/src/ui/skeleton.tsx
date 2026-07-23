import { cn } from "../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Static bg-muted is the reduced-motion fallback; the gradient sweep
        // only paints under motion-safe.
        "rounded-md bg-muted",
        "motion-safe:animate-shimmer motion-safe:bg-gradient-to-r motion-safe:from-muted motion-safe:via-muted-foreground/10 motion-safe:to-muted motion-safe:bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
