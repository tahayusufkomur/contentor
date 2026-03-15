import { cookies, headers } from 'next/headers'
import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'
import { ApiError } from '@/types/api'

export async function serverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const headersList = await headers()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const tenantDomain = headersList.get('x-tenant-domain')

  const res = await fetch(`${DJANGO_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenantDomain && { Host: tenantDomain }),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new ApiError(res.status, await res.json())
  }

  return res.json()
}
