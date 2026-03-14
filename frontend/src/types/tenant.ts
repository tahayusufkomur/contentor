export interface TenantConfig {
  id: number
  brand_name: string
  logo_url: string
  primary_color: string
  secondary_color: string
  font_family: string
  custom_css: string
  enabled_modules: string[]
  social_links: Record<string, string>
  meta_description: string
}
