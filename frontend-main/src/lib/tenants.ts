import { cookies } from 'next/headers'
import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export interface MyTenant {
  id: number
  name: string
  slug: string
  region: 'global' | 'tr'
  is_active: boolean
  is_published: boolean
  has_preview_password: boolean
  provisioning_status: 'pending' | 'provisioning' | 'ready' | 'failed'
  plan_name: string | null
  domain: string
  studio_url: string
  created_at: string
}

export async function getMyTenants(): Promise<MyTenant[]> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return []

  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/me/tenants/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Domain': BASE_DOMAIN,
      },
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
