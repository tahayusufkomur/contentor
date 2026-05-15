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
  if (!slug || slug === 'unknown') return null

  // Prefer the live request host so TR tenants (<slug>.tr.<BASE_DOMAIN>) and
  // custom domains resolve to the right Domain row. Fall back to a slug-built
  // global hostname only when headers are unavailable (generateMetadata,
  // manifest.ts), where the slug+BASE_DOMAIN guess is the best we can do.
  const liveDomain = (await getTenantDomain()).split(':')[0]
  const domain = liveDomain || `${slug}.${BASE_DOMAIN}`

  const cached = configCache.get(domain)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config
  }

  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
      headers: { 'X-Tenant-Domain': domain },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const config: TenantConfig = await res.json()
    configCache.set(domain, { config, timestamp: Date.now() })
    return config
  } catch {
    return null
  }
}
