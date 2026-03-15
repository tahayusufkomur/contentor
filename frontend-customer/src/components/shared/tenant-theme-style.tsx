import { hexToOklch } from '@/lib/colors'
import type { TenantConfig } from '@/types/tenant'

export function TenantThemeStyle({ config }: { config: TenantConfig }) {
  const primary = hexToOklch(config.primary_color)
  const secondary = hexToOklch(config.secondary_color)

  const css = `:root {
    --primary: ${primary};
    --secondary: ${secondary};
    --ring: ${primary};
    --font-sans: '${config.font_family}', system-ui, sans-serif;
  }
  ${config.custom_css || ''}`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
