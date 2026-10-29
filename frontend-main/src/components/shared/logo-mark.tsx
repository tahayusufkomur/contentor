import { Mark } from "@shared/ui/contentor-brand";
import { cn } from "@/lib/utils";

export { Mark };

/** The product's name: a brand name, the same in every language. */
export const BRAND_NAME = "Contentor";

// The letters after the mark, which is the word's C: a logotype, not text to translate.
const LOGOTYPE_TAIL = "ontent";

interface WordmarkProps {
  className?: string;
}

// The last "o" as a play button, drawn to Geist SemiBold's "o" in 1/1000 em
// (ink 39..564 wide, -12..546 tall; box = advance less the -25 tracking).
const ell = (rx: number, ry: number) =>
  `M${301.5 - rx} 279a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

function PlayO() {
  return (
    <svg
      viewBox="0 0 578 558"
      aria-hidden
      fill="currentColor"
      className="inline-block h-[0.558em] w-[0.578em] align-[-0.012em]"
    >
      <path d={ell(262.5, 279) + ell(150.5, 167)} fillRule="evenodd" />
      <path d="M243.5 191L401.5 279L243.5 367Z" />
    </svg>
  );
}

/**
 * The brand lockup: the mark IS the word's C, a big initial centred on the
 * letters, then "ontentor" whose last "o" is a play button. House tokens; use
 * in headers, footers, and any horizontal brand row; size it with a text class.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      role="img"
      aria-label={BRAND_NAME}
      className={cn(
        "whitespace-nowrap font-semibold tracking-tight text-foreground select-none",
        className,
      )}
    >
      <Mark className="mr-[0.08em] inline-block size-[1.3em] align-[-0.3em]" />
      {LOGOTYPE_TAIL}
      <span className="text-marketing-accent">
        <PlayO />r
      </span>
    </span>
  );
}

interface MonogramProps {
  /** Width/height of the square tile in px. */
  size?: number;
  /** Letter(s) shown inside the tile. Defaults to the brand initial. */
  label?: string;
  className?: string;
}

/**
 * Monogram tile — an app-icon-style square built from a letter. Drops into the
 * square/icon slots the old SVG mark used to fill, scaling with `size`.
 */
export function Monogram({ size = 32, label = "C", className }: MonogramProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[28%] bg-primary font-semibold leading-none text-primary-foreground select-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {label}
    </span>
  );
}

/** Back-compat alias — existing call sites import `LogoMark`. */
export const LogoMark = Monogram;
