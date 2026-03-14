import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(request: NextRequest) {
  const { token } = await request.json()
  const headersList = await headers()
  const tenantDomain = headersList.get('x-tenant-domain')

  const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/magic-link/verify/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tenantDomain && { Host: tenantDomain }),
    },
    body: JSON.stringify({ token }),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  const response = NextResponse.json(data)

  const setCookieHeader = res.headers.get('set-cookie')
  if (setCookieHeader) {
    response.headers.set('set-cookie', setCookieHeader)
  }

  return response
}
