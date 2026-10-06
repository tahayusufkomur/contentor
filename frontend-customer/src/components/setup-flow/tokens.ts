import type { CSSProperties } from "react";

/** The setup shell's own palette: warm, quiet paper neutrals. The tenant
 * app's :root variables are the coach's site style; the shell re-declares
 * them on its root so the shared primitives (Button, Skeleton, Spinner)
 * render in these neutrals and the coach's site inside the preview frame is
 * the only real colour on screen. `--sf-*` are shell-only tokens. */
export const SHELL_TOKENS = {
  "--sf-wall": "#ECE8E1",
  "--sf-wall-lit": "#F5F2EC",
  "--sf-paper": "#FBFAF7",
  "--sf-tint": "#F3F0EA",
  "--sf-tint-strong": "#EAE6DE",
  "--sf-ink": "#22211F",
  "--sf-graphite": "#5B5852",
  "--sf-faint": "#8F8A82",
  "--sf-line": "#E4DFD7",
  "--sf-line-strong": "#CFC9BF",
  "--sf-brass": "#9A773A",
  "--sf-brass-soft": "#F1E8D7",
  "--sf-frame-shadow":
    "0 1px 2px rgb(48 36 20 / 0.06), 0 24px 56px -24px rgb(48 36 20 / 0.34)",

  "--background": "#FBFAF7",
  "--foreground": "#22211F",
  "--card": "#FFFFFF",
  "--card-foreground": "#22211F",
  "--popover": "#FFFFFF",
  "--popover-foreground": "#22211F",
  "--primary": "#22211F",
  "--primary-foreground": "#FBFAF7",
  "--secondary": "#F3F0EA",
  "--secondary-foreground": "#22211F",
  "--muted": "#EEEAE3",
  "--muted-foreground": "#5B5852",
  "--accent": "#F3F0EA",
  "--accent-foreground": "#22211F",
  "--border": "#E4DFD7",
  "--input": "#CFC9BF",
  "--ring": "#9A773A",
  "--radius": "0.625rem",
  "--font-sans": "var(--font-setup), system-ui, sans-serif",
  "--font-display": "var(--font-setup), system-ui, sans-serif",
  fontFamily: "var(--font-setup), system-ui, sans-serif",
  backgroundColor: "var(--sf-paper)",
  color: "var(--sf-ink)",
} as CSSProperties;

/** Shell-scoped CSS: keyframes (used only behind `motion-safe:`) and the
 * disabled primary button — a soft ink tint that reads as "not yet", not
 * the shared button's 50%-opacity grey. A loading button stays full ink
 * (its spinner already says busy). `--sf-spring` is a damped spring
 * (about 9% overshoot) sampled into a linear() easing: the motion-graphics
 * feel of each slide, with no animation library. */
export const SHELL_CSS = `
.sf-shell { --sf-spring: linear(0, 0.07, 0.232, 0.431, 0.627, 0.795, 0.924, 1.014, 1.067, 1.091, 1.094, 1.084, 1.067, 1.048, 1.03, 1.015, 1.004, 0.997, 0.993, 0.991, 0.991, 0.993, 0.996, 0.999, 1); }
@keyframes sf-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes sf-word { from { opacity: 0; transform: translateY(0.45em) scale(0.96); filter: blur(10px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes sf-pop { from { opacity: 0; transform: translateY(18px) scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes sf-glow { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes sf-ring { 0% { opacity: .55; transform: scale(.55); } 100% { opacity: 0; transform: scale(2.6); } }
@keyframes sf-breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.7); } }
@keyframes sf-slide-next { from { opacity: 0; transform: translateX(48px); } to { opacity: 1; transform: none; } }
@keyframes sf-slide-back { from { opacity: 0; transform: translateX(-48px); } to { opacity: 1; transform: none; } }
.sf-shell [data-slot="button"].bg-primary:disabled { opacity: 1; background: rgb(34 33 31 / 0.09); color: rgb(34 33 31 / 0.38); box-shadow: none; }
.sf-shell [data-slot="button"].bg-primary[aria-busy="true"] { background: var(--sf-ink); color: var(--sf-paper); }
`;
