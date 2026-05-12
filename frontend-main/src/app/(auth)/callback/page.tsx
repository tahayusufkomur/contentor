'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'

export default function CallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const source = searchParams.get('source')
    if (!token) {
      setError('No token provided')
      return
    }

    if (source === 'google') {
      fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      })
        .then(async (res) => {
          if (!res.ok) {
            setError('Authentication failed')
            return
          }
          router.push('/')
        })
        .catch(() => setError('Network error'))
      return
    }

    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          setError(data.detail || 'Verification failed')
          return
        }
        router.push('/')
      })
      .catch(() => setError('Network error'))
  }, [searchParams, router])

  if (error) {
    return (
      <AuthShell eyebrow="Error" title="Something went wrong" subtitle={error}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="One moment"
      title="Verifying"
      subtitle="Signing you in securely…"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong text-primary">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    </AuthShell>
  )
}
