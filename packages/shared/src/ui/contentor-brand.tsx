import { BASE_DOMAIN } from "../lib/constants";
import { cn } from "../lib/utils";

/**
 * The Contentor mark: an ink tile carrying an open ring whose last stretch
 * turns brass, the way the wordmark's "or" does. Fixed artwork, identical to
 * frontend-main/src/app/icon.svg; sized in em so it scales with text beside it.
 * Under .dark the tile lifts a step and gains a hairline edge so it does not
 * dissolve into the page; the cream ring then reads as the light "C".
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-[1.3em] shrink-0", className)}
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill="#171614"
        className="dark:fill-[#262421]"
      />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        fill="none"
        stroke="#f5f3ef"
        strokeOpacity={0.16}
        className="hidden dark:block"
      />
      <g
        fill="none"
        strokeWidth={4.6}
        strokeLinecap="round"
        transform="translate(16 16) scale(0.72) translate(-16 -16)"
      >
        <path
          d="M24.043 9.251A10.5 10.5 0 1 0 12.409 25.867"
          stroke="#f5f3ef"
        />
        <path
          d="M12.409 25.867A10.5 10.5 0 0 0 24.043 22.749"
          stroke="#e1ad63"
        />
      </g>
    </svg>
  );
}

/** The apex, with the scheme the dev stack and prod each use. */
const APEX =
  BASE_DOMAIN === "localhost" ? "http://localhost" : `https://${BASE_DOMAIN}`;

/**
 * "Built with Contentor": the pill a free-plan site wears in its footer. An
 * external link, so a plain anchor: it leaves the coach's site for the apex.
 */
export function ContentorBadge({ className }: { className?: string }) {
  return (
    <a
      href={`${APEX}/?ref=badge`}
      target="_blank"
      rel="noopener"
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <Mark className="size-4" />
      <span>
        Built with{" "}
        <span className="font-semibold text-foreground">Contentor</span>
      </span>
    </a>
  );
}
