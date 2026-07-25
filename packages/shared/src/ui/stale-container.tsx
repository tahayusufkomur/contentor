import { cn } from "../lib/utils";
import { ProgressLine } from "./progress-line";

/** Refinement loads (search, sort, filter, paginate) keep the existing rows on
 *  screen, dimmed and inert, rather than blanking to a skeleton. Children are
 *  never unmounted, so scroll position and layout stay anchored. */
export function StaleContainer({
  pending,
  children,
  className,
  showLine = true,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  showLine?: boolean;
}) {
  return (
    <div aria-busy={pending || undefined} className={cn("relative", className)}>
      {showLine && pending && (
        <div className="absolute inset-x-0 top-0 z-10">
          <ProgressLine />
        </div>
      )}
      <div
        className={cn(
          "transition-opacity duration-200",
          pending && "pointer-events-none opacity-60",
        )}
      >
        {children}
      </div>
    </div>
  );
}
