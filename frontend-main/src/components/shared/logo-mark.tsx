import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
}

/**
 * Text wordmark — the primary brand lockup. Pure text in house tokens, no
 * image. Use in headers, footers, and any horizontal brand row.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight text-foreground select-none",
        className,
      )}
    >
      Content<span className="text-marketing-accent">or</span>
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
