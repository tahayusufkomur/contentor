import type { MetadataRoute } from 'next'
import { fetchTenantConfig, getTenantSlug } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = await getTenantSlug()
  const config = slug !== '__platform__' ? await fetchTenantConfig(slug) : null
  return {
    name: config?.brand_name ?? 'Contentor',
    short_name: config?.brand_name ?? 'Contentor',
    description: config?.meta_description ?? 'Content creator platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: config?.primary_color ?? '#7c3aed',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
