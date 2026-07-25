import { cn } from "../lib/utils";

/** 2px indeterminate bar. Shared by NavigationProgress (viewport top) and
 *  StaleContainer (container top edge) so the app has one "work in progress"
 *  visual. Under reduced motion the travel is dropped but the bar stays
 *  visible — the state matters, the movement is decoration. */
export function ProgressLine({ className }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn("h-0.5 w-full overflow-hidden bg-primary/20", className)}
    >
      <div className="bg-primary h-full w-1/3 motion-safe:animate-progress-indeterminate motion-reduce:w-full" />
    </div>
  );
}
