import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { SHELL_TOKENS } from "./tokens";

/** The wizard's one "this is being updated" cover, so no wait goes unseen.
 * A paper tint with a light sweep over it, a brass bar along the top, and a
 * plain sentence saying what is happening. Without motion it is still a
 * solid tint and the sentence. It blocks clicks on what it covers.
 *
 * - `card`: over the nearest `relative` block (a draft being rewritten);
 *   the message stays in view while a tall block scrolls under it.
 * - `compact`: a small pill over a picture or a pane.
 * - `screen`: over the whole window, for a wait that is not about one spot. */
export function BusyOverlay({
  message,
  hint,
  steps,
  variant = "card",
  className,
}: {
  message: string;
  hint?: string;
  /** What it is working through; they pulse (the backend sends no per-step progress). */
  steps?: string[];
  variant?: "card" | "compact" | "screen";
  className?: string;
}) {
  const screen = variant === "screen";
  const compact = variant === "compact";
  return (
    <div
      role="status"
      aria-live="polite"
      style={
        screen
          ? { ...SHELL_TOKENS, backgroundColor: "rgb(251 250 247 / 0.85)" }
          : undefined
      }
      className={cn(
        "flex justify-center bg-[rgb(251_250_247/0.7)] px-4 backdrop-blur-[2px] motion-safe:animate-fade-in",
        screen &&
          "sf-shell fixed inset-0 z-40 items-center px-6 backdrop-blur-sm",
        compact && "absolute inset-0 z-10 items-center",
        variant === "card" &&
          "absolute -inset-3 z-10 items-start rounded-3xl sm:-inset-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <span className="absolute inset-0 motion-safe:animate-shimmer motion-safe:bg-gradient-to-r motion-safe:from-transparent motion-safe:via-white/80 motion-safe:to-transparent motion-safe:bg-[length:200%_100%]" />
        {!compact && (
          <span className="absolute inset-x-0 top-0 hidden h-1 bg-[var(--sf-brass-soft)] motion-safe:block">
            <span className="block h-full w-1/3 bg-[var(--sf-brass)] motion-safe:animate-progress-indeterminate" />
          </span>
        )}
      </span>
      {screen ? (
        <div className="relative flex max-w-md flex-col items-center gap-4 text-center">
          <Spinner aria-hidden size="lg" className="text-[var(--sf-brass)]" />
          <p className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[var(--sf-ink)]">
            {message}
          </p>
          {hint && (
            <p className="text-[15px] leading-relaxed text-[var(--sf-graphite)]">
              {hint}
            </p>
          )}
        </div>
      ) : compact ? (
        <p className="relative flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[var(--sf-ink)] shadow-[0_8px_24px_-10px_rgb(48_36_20/0.5)]">
          <Spinner aria-hidden size="sm" className="text-[var(--sf-brass)]" />
          {message}
        </p>
      ) : (
        <div className="sticky top-28 mt-10 w-full max-w-[22rem] rounded-2xl border border-[var(--sf-line)] bg-white px-5 py-4 shadow-[0_18px_40px_-20px_rgb(48_36_20/0.45)]">
          <p className="flex items-start gap-2.5 text-[16px] font-semibold leading-snug text-[var(--sf-ink)]">
            <Spinner
              aria-hidden
              className="mt-0.5 shrink-0 text-[var(--sf-brass)]"
            />
            {message}
          </p>
          {steps && <WorkSteps steps={steps} className="mt-3 pl-[30px]" />}
          {hint && (
            <p className="mt-3 pl-[30px] text-[13px] text-[var(--sf-faint)]">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The steps a piece of work goes through, each glowing in turn. */
export function WorkSteps({
  steps,
  className,
}: {
  steps: string[];
  className?: string;
}) {
  return (
    <ol aria-hidden className={cn("space-y-2.5", className)}>
      {steps.map((label, i) => (
        <li
          key={label}
          style={{ animationDelay: `${i * 0.6}s` }}
          className="flex items-center gap-2.5 text-[14px] text-[var(--sf-graphite)] motion-safe:animate-[sf-glow_1.8s_ease-in-out_infinite]"
        >
          <span className="size-1.5 rounded-full bg-[var(--sf-brass)]" />
          {label}
        </li>
      ))}
    </ol>
  );
}
