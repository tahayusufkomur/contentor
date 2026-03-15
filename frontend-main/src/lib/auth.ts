import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'
import type { User } from '@/types/auth'

export async function getAuthUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/users/me/`, {
      headers: { Authorization: `Bearer ${token}`, Host: 'localhost' },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<User> {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  return user
}

export async function requireSuperuser(): Promise<User> {
  const user = await requireAuth()
  if (!(user as any).is_superuser) redirect('/')
  return user
}
