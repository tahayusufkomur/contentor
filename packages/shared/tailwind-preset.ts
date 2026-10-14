import type { Config } from "tailwindcss";

type ColorTree = { [key: string]: string | ColorTree };

/** Gives every token colour in the tree an opacity modifier.
 *
 *  The tokens are whole colours (`oklch(…)`, `color-mix(…)`), and Tailwind v3
 *  cannot put alpha into an opaque `var()`: with plain `"var(--primary)"`
 *  strings, `bg-primary/10`, `hover:bg-primary/90` or `ring-ring/50` emitted no
 *  rule at all. With a modifier the colour is now mixed toward transparent;
 *  without one the class still emits the bare `var()`, so nothing else moves.
 *  (`bg-primary bg-opacity-50`, the pre-modifier spelling, stays unsupported.) */
export function alphaTokens<T extends ColorTree>(colors: T): T {
  const leaf =
    (token: string) =>
    ({
      opacityVariable,
      opacityValue,
    }: {
      opacityVariable?: string;
      opacityValue?: string;
    } = {}) =>
      opacityValue === undefined || opacityVariable
        ? token
        : `color-mix(in oklab, ${token} calc(${opacityValue} * 100%), transparent)`;
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      key,
      typeof value === "string" ? leaf(value) : alphaTokens(value),
    ]),
  ) as unknown as T;
}

// Loading/feedback motion shared by both apps. Decorative only — callers gate
// usage behind `motion-safe:` so reduced-motion users get static equivalents.
const preset: Partial<Config> = {
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.2s ease-out both",
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
      },
    },
  },
};

export default preset;
