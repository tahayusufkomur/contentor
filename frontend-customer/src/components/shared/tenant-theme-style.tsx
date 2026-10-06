import { generateThemeCSS } from "@/lib/themes";
import { getSiteStyle, styleRootCss } from "@/lib/site-styles";
import type { TenantConfig } from "@/types/tenant";

export function TenantThemeStyle({ config }: { config: TenantConfig }) {
  const siteStyle = getSiteStyle(config.style);
  const css = siteStyle
    ? styleRootCss(siteStyle, config.custom_css || "", config.palette)
    : generateThemeCSS(
        config.theme,
        config.font_family,
        config.custom_css || "",
      );

  return (
    <style dangerouslySetInnerHTML={{ __html: css }} suppressHydrationWarning />
  );
}
