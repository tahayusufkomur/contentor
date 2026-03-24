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

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  return res.json()
}

/**
 * Execute async tasks in batches to avoid rate limiting.
 * Runs `batchSize` tasks concurrently, then waits `delayMs` before next batch.
 */
export async function batchedAsync<T>(
  tasks: (() => Promise<T>)[],
  batchSize = 8,
  delayMs = 200,
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map((fn) => fn()))
    results.push(...batchResults)
    if (i + batchSize < tasks.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return results
}
