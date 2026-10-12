import { generateThemeCSS } from "@/lib/themes";
import {
  getSiteStyle,
  styleRootCss,
  TENANT_THEME_SHEET_ID,
} from "@/lib/site-styles";
import type { TenantConfig } from "@/types/tenant";

/** The tenant's look, as one sheet. `off` (the coach admin) renders it
 *  disabled; ThemeProvider flips it on in-app navigation by its id. */
export function TenantThemeStyle({
  config,
  off,
}: {
  config: TenantConfig;
  off?: boolean;
}) {
  const siteStyle = getSiteStyle(config.style);
  const css = siteStyle
    ? styleRootCss(siteStyle, config.custom_css || "", config.palette)
    : generateThemeCSS(
        config.theme,
        config.font_family,
        config.custom_css || "",
      );

  return (
    <style
      id={TENANT_THEME_SHEET_ID}
      media={off ? "not all" : undefined}
      dangerouslySetInnerHTML={{ __html: css }}
      suppressHydrationWarning
    />
  );
}
