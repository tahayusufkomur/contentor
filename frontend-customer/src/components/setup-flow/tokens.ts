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
 * feel of each slide, with no animation library. Between questions the
 * outgoing slide leaves through a view transition (`sf-slide`, direction
 * on `:root[data-sf-dir]`) while the header and answer box hold still; the
 * incoming slide's own entrance keyframes then land it. */
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
@keyframes sf-leave-next { to { opacity: 0; transform: translateX(-72px) scale(0.985); filter: blur(8px); } }
@keyframes sf-leave-back { to { opacity: 0; transform: translateX(72px) scale(0.985); filter: blur(8px); } }
::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
::view-transition-old(sf-slide), ::view-transition-new(sf-slide) { mix-blend-mode: normal; }
::view-transition-old(sf-slide) { animation: sf-leave-next .42s cubic-bezier(.5, 0, .75, .3) both; }
::view-transition-new(sf-slide) { animation: none; }
:root[data-sf-dir="back"]::view-transition-old(sf-slide) { animation-name: sf-leave-back; }
.sf-backdrop { position: absolute; inset: -25%; z-index: 0; pointer-events: none; opacity: .9; background: radial-gradient(38% 46% at 18% 28%, rgb(241 232 215 / .95), rgb(241 232 215 / 0) 70%), radial-gradient(34% 40% at 82% 18%, rgb(226 220 236 / .8), rgb(226 220 236 / 0) 70%), radial-gradient(42% 38% at 64% 86%, rgb(214 229 222 / .85), rgb(214 229 222 / 0) 70%), radial-gradient(30% 34% at 28% 88%, rgb(240 222 205 / .7), rgb(240 222 205 / 0) 70%); animation: sf-shader 28s ease-in-out infinite alternate; }
.sf-backdrop::after { content: ""; position: absolute; inset: 0; background: radial-gradient(50% 60% at 50% 50%, rgb(255 255 255 / .4), transparent 70%); animation: sf-shader-2 19s ease-in-out infinite alternate; }
@keyframes sf-shader { 0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); } 50% { transform: translate3d(4%, -3%, 0) rotate(3deg) scale(1.08); } 100% { transform: translate3d(-4%, 3%, 0) rotate(-2deg) scale(1.03); } }
@keyframes sf-shader-2 { from { transform: translate3d(-6%, 4%, 0) scale(1.1); } to { transform: translate3d(6%, -4%, 0) scale(0.95); } }
@media (prefers-reduced-motion: reduce) { .sf-backdrop, .sf-backdrop::after { animation: none; } }
.sf-shell [data-slot="button"].bg-primary:disabled { opacity: 1; background: rgb(34 33 31 / 0.09); color: rgb(34 33 31 / 0.38); box-shadow: none; }
.sf-shell [data-slot="button"].bg-primary[aria-busy="true"] { background: var(--sf-ink); color: var(--sf-paper); }
`;
