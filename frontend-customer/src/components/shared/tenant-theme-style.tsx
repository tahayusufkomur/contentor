import { generateThemeCSS } from "@/lib/themes";
import type { TenantConfig } from "@/types/tenant";

export function TenantThemeStyle({ config }: { config: TenantConfig }) {
  const css = generateThemeCSS(
    config.theme,
    config.font_family,
    config.custom_css || "",
  );

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
