import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(request: NextRequest) {
  const { token } = await request.json()
  const headersList = await headers()

  // Get tenant domain from middleware header, or fall back to request host
  let tenantDomain = headersList.get('x-tenant-domain')
  if (!tenantDomain) {
    tenantDomain = headersList.get('host') || 'localhost'
  }
  // Strip port if present
  const hostOnly = tenantDomain.split(':')[0]

  // Build URL with tenant domain as the hostname so Host header is set correctly
  // Node.js fetch (undici) ignores custom Host headers, so we must use the actual hostname
  const djangoUrl = new URL('/api/v1/auth/magic-link/verify/', DJANGO_API_URL)

  try {
    const res = await fetch(djangoUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Domain': hostOnly,
      },
      body: JSON.stringify({ token }),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('Django returned non-JSON:', text.substring(0, 200))
      return NextResponse.json(
        { detail: 'Verification service unavailable' },
        { status: 502 },
      )
    }

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }

    const response = NextResponse.json(data)

    // Forward the auth cookie from Django
    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      response.headers.set('set-cookie', setCookieHeader)
    }

    return response
  } catch (err) {
    console.error('Failed to reach Django:', err)
    return NextResponse.json(
      { detail: 'Verification service unavailable' },
      { status: 502 },
    )
  }
}
