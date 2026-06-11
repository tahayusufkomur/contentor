'use client'

import { useEffect, useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'

import { BASE_DOMAIN } from '@/lib/constants'

interface ImpersonationState {
  email: string
  by: string
  scope: string
}

// Fixed banner shown whenever the current session is impersonated. Reads the
// state from the signed session claim via /users/me (can't be spoofed), and
// offers an Exit that ends the impersonated session.
export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/v1/auth/users/me/', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.impersonating) {
          setState({ email: data.email, by: data.impersonating.by, scope: data.impersonating.scope })
        }
      })
      .catch(() => undefined)
  }, [])

  if (!state) return null

  const exit = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/impersonate/stop', { method: 'POST', credentials: 'same-origin' })
      const data = await res.json().catch(() => ({ restored: false }))
      if (data.restored) {
        // Coach returns to their own admin.
        window.location.assign('/admin')
      } else if (state.scope === 'platform') {
        // Superadmin returns to the platform panel on the apex domain.
        window.location.assign(`${window.location.protocol}//${BASE_DOMAIN}/admin`)
      } else {
        window.location.assign('/')
      }
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-amber-500/40 bg-amber-500/95 text-amber-950 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            Viewing as <strong>{state.email}</strong> · impersonated by {state.by}
          </span>
        </div>
        <button
          type="button"
          onClick={exit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/90 px-3 py-1 font-medium text-amber-50 transition-colors hover:bg-amber-950 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Exit
        </button>
      </div>
    </div>
  )
}
