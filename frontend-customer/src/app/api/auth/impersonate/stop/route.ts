import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { DJANGO_API_URL } from '@/lib/constants'

// End an impersonated session: Django either restores the impersonator's
// stashed session or clears the cookie. Forward cookies both ways.
export async function POST(request: NextRequest) {
  const headersList = await headers()
  const tenantDomain = headersList.get('x-tenant-domain') || headersList.get('host') || 'localhost'
  const hostOnly = tenantDomain.split(':')[0]

  try {
    const res = await fetch(new URL('/api/v1/auth/impersonate/stop/', DJANGO_API_URL).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Domain': hostOnly,
        Cookie: request.headers.get('cookie') ?? '',
      },
    })

    const data = await res.json().catch(() => ({ restored: false }))
    const response = NextResponse.json(data, { status: res.status })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) response.headers.set('set-cookie', setCookie)
    return response
  } catch (err) {
    console.error('Impersonation stop failed to reach Django:', err)
    return NextResponse.json({ detail: 'Service unavailable' }, { status: 502 })
  }
}
