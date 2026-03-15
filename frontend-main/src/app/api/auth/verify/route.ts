import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(request: NextRequest) {
  const { token } = await request.json()

  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/magic-link/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost' },
      body: JSON.stringify({ token }),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return NextResponse.json({ detail: 'Service unavailable' }, { status: 502 })
    }

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }

    const response = NextResponse.json(data)

    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      response.headers.set('set-cookie', setCookieHeader)
    }

    return response
  } catch {
    return NextResponse.json({ detail: 'Service unavailable' }, { status: 502 })
  }
}
