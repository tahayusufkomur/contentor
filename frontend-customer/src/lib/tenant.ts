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

  // Distinguish "tenant genuinely does not exist" (Django 404 → null, the caller may
  // 404 the page) from a transient failure (network error / 5xx). A transient blip must
  // NOT be reported as "no tenant" — that wrongly 404s a valid tenant on cold loads — so
  // retry briefly before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
        headers: { 'X-Tenant-Domain': domain },
        cache: 'no-store',
      })
      if (res.status === 404) return null // definitive: no such tenant
      if (res.ok) {
        const config: TenantConfig = await res.json()
        configCache.set(domain, { config, timestamp: Date.now() })
        return config
      }
      // 5xx and other non-ok statuses are transient — fall through to retry
    } catch {
      // network error — fall through to retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150))
  }
  return null
}
