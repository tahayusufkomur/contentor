import { NextRequest, NextResponse } from 'next/server'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'contentor.localhost'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const host = hostname.split(':')[0]

  const headers = new Headers(request.headers)

  if (host === BASE_DOMAIN || host === 'localhost') {
    headers.set('x-tenant-slug', '__platform__')
  } else if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const slug = host.split('.')[0]
    headers.set('x-tenant-slug', slug)
  } else {
    headers.set('x-tenant-slug', '__custom__')
  }

  headers.set('x-tenant-domain', hostname)

  if (process.env.NODE_ENV === 'development') {
    const devTenant = request.headers.get('x-dev-tenant')
    if (devTenant) {
      headers.set('x-tenant-slug', devTenant)
    }
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js).*)'],
}
