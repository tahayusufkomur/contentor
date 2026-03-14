import { headers } from 'next/headers'

import { DJANGO_API_URL } from '@/lib/constants'
import type { TenantConfig } from '@/types/tenant'

export async function getTenantSlug(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-tenant-slug') || '__platform__'
}

export async function getTenantDomain(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-tenant-domain') || ''
}

const configCache = new Map<string, { config: TenantConfig; timestamp: number }>()
const CACHE_TTL = 60_000

export async function fetchTenantConfig(slug: string): Promise<TenantConfig | null> {
  if (slug === '__platform__') return null

  const cached = configCache.get(slug)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config
  }

  try {
    const domain = await getTenantDomain()
    const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
      headers: { Host: domain },
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
