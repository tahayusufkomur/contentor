import { cookies, headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

async function proxyRequest(request: NextRequest) {
  const cookieStore = await cookies()
  const headersList = await headers()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const tenantDomain = headersList.get('x-tenant-domain')

  const path = request.nextUrl.pathname.replace('/api/proxy', '')
  const url = `${DJANGO_API_URL}${path}${request.nextUrl.search}`

  const body = request.method !== 'GET' ? await request.text() : undefined

  const res = await fetch(url, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenantDomain && { Host: tenantDomain }),
    },
    body,
  })

  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
