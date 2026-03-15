import { ApiError } from '@/types/api'

export async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new ApiError(res.status, data)
  }

  return res.json()
}
