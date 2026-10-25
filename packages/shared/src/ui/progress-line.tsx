import { cn } from "../lib/utils";

/** 3px bar. Shared by NavigationProgress (viewport top) and StaleContainer
 *  (container top edge) so the app has one "work in progress" visual, and by
 *  the blog's reading bar with `value`. Indeterminate by default; under
 *  reduced motion the travel is dropped but the bar stays visible — the state
 *  matters, the movement is decoration. With `value` (0–1) the fill is the
 *  value and nothing moves on its own. */
export function ProgressLine({
  className,
  value,
  label = "Loading",
}: {
  className?: string;
  value?: number;
  label?: string;
}) {
  const determinate = typeof value === "number";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cn("h-[3px] w-full overflow-hidden bg-muted", className)}
    >
      {determinate ? (
        <div
          className="h-full w-full origin-left bg-primary"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }}
        />
      ) : (
        <div className="bg-primary h-full w-1/3 motion-safe:animate-progress-indeterminate motion-reduce:w-full" />
      )}
    </div>
  );
}
