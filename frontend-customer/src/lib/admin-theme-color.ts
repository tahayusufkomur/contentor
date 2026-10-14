/** The studio's browser-bar colour per scheme: the token sheet's `--background`
 *  (packages/shared/src/styles/tokens.css) as sRGB hex, because
 *  <meta name="theme-color"> takes no oklch(). Pinned to the sheet by
 *  lib/__tests__/admin-theme-color.test.ts — change the sheet, the test says
 *  which hex to paste here. */
export const ADMIN_THEME_COLOR = {
  light: "#ffffff", // oklch(1 0 0)
  dark: "#080706", // oklch(0.13 0.005 80)
} as const;
