import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const res = await fetch(`${DJANGO_API_URL}/api/v1/domains/${params.id}/retry/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Domain': host },
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
