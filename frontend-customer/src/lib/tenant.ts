import { headers } from 'next/headers'

import { BASE_DOMAIN, DJANGO_API_URL } from '@/lib/constants'
import type { TenantConfig } from '@/types/tenant'

export async function getTenantSlug(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-tenant-slug') || 'unknown'
}

export async function getTenantDomain(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-tenant-domain') || ''
}

export const configCache = new Map<string, { config: TenantConfig; timestamp: number }>()
const CACHE_TTL = 60_000

export async function fetchTenantConfig(slug: string): Promise<TenantConfig | null> {
  const cached = configCache.get(slug)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config
  }

  if (!slug || slug === 'unknown') return null

  try {
    // Build domain from slug — getTenantDomain() can return empty in some
    // server-side contexts (generateMetadata, manifest.ts)
    const domain = `${slug}.${BASE_DOMAIN}`
    const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
      headers: { 'X-Tenant-Domain': domain },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const config: TenantConfig = await res.json()
    configCache.set(slug, { config, timestamp: Date.now() })
    return config
  } catch {
    return null
  }
}
