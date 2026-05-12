import { toast } from 'sonner'

import { BASE_DOMAIN } from '@/lib/constants'
import { ApiError } from '@/types/api'

interface DemoReadonlyPayload {
  detail: 'demo_readonly'
  message?: string
  niche?: string
  tenant_name?: string
}

function isDemoReadonly(data: unknown): data is DemoReadonlyPayload {
  return typeof data === 'object' && data !== null && (data as { detail?: string }).detail === 'demo_readonly'
}

let demoToastShownAt = 0

function showDemoReadonlyToast(data: DemoReadonlyPayload) {
  // Debounce: a single user action can fire multiple requests (eg. save +
  // optimistic refresh). One toast per ~3s is plenty.
  const now = Date.now()
  if (now - demoToastShownAt < 3000) return
  demoToastShownAt = now

  const apex = BASE_DOMAIN.replace(/^demo-[^.]+\./, '')
  const niche = data.niche || ''
  const signupHref = `//${apex}/signup${niche ? `?template=${encodeURIComponent(niche)}` : ''}`

  toast.info(data.message || 'This is a demo — sign up to keep your changes.', {
    action: {
      label: 'Sign up',
      onClick: () => {
        window.location.href = signupHref
      },
    },
  })
}

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
    if (res.status === 403 && isDemoReadonly(data)) {
      showDemoReadonlyToast(data)
    }
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
