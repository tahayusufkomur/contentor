import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

const VALID_ROLES = new Set(['student', 'coach'])

/**
 * Demo entry: swaps the visitor's session for a synthetic demo JWT
 * (student or coach) bound to the current demo tenant.
 *
 * GET so marketing-site links and in-app toggle buttons can use a plain
 * <a href>. Calls Django /api/v1/demo/enter/, sets the auth cookie on this
 * subdomain, and 302s to / (student) or /admin (coach).
 */
export async function GET(request: NextRequest) {
  const role = (request.nextUrl.searchParams.get('as') || 'student').toLowerCase()
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ detail: 'invalid_role' }, { status: 400 })
  }

  const headersList = await headers()
  const host = (headersList.get('x-tenant-domain') || headersList.get('host') || '').split(':')[0]
  if (!host) {
    return NextResponse.json({ detail: 'no_host' }, { status: 400 })
  }

  let backendData: { token?: string; redirect?: string; detail?: string }
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/demo/enter/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Domain': host,
      },
      body: JSON.stringify({ as: role }),
    })
    backendData = await res.json().catch(() => ({ detail: 'bad_response' }))
    if (!res.ok) {
      return NextResponse.json(backendData, { status: res.status })
    }
  } catch (err) {
    console.error('demo/enter: backend unreachable', err)
    return NextResponse.json({ detail: 'demo_unavailable' }, { status: 502 })
  }

  const token = backendData.token
  const redirect = backendData.redirect || (role === 'coach' ? '/admin' : '/')
  if (!token) {
    return NextResponse.json({ detail: 'no_token' }, { status: 502 })
  }

  const response = NextResponse.redirect(new URL(redirect, request.url))
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  })
  return response
}
