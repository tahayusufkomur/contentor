'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, AlertCircle, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/auth/auth-shell'

type VerifyState = 'verifying' | 'provisioning' | 'ready' | 'error'

function StateIcon({
  variant,
  children,
}: {
  variant: 'primary' | 'success' | 'destructive'
  children: React.ReactNode
}) {
  const styles: Record<typeof variant, string> = {
    primary: 'text-primary bg-primary/10',
    success: 'text-emerald-500 bg-emerald-500/10',
    destructive: 'text-destructive bg-destructive/10',
  }
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong ${styles[variant]}`}
    >
      {children}
    </div>
  )
}

export default function SignupVerifyPage() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<VerifyState>('verifying')
  const [error, setError] = useState('')
  const [slug, setSlug] = useState('')
  const [domain, setDomain] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const verifiedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (verifiedRef.current) return
    verifiedRef.current = true

    const token = searchParams.get('token')
    if (!token) {
      setError('No verification token provided')
      setState('error')
      return
    }

    fetch('/api/v1/onboarding/signup/verify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          setError(data.detail || 'Verification failed')
          setState('error')
          return
        }

        setSlug(data.slug)
        setDomain(data.domain)

        if (data.status === 'ready') {
          setState('ready')
          return
        }

        setState('provisioning')
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/onboarding/status/?slug=${data.slug}`, {
              credentials: 'same-origin',
            })
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.status === 'ready') {
                if (pollRef.current) clearInterval(pollRef.current)
                setDomain(statusData.domain)
                setState('ready')
              } else if (statusData.status === 'failed') {
                if (pollRef.current) clearInterval(pollRef.current)
                setError('Setup failed. Please try again or contact support.')
                setState('error')
              }
            }
          } catch {
            // Keep polling
          }
        }, 2000)
      })
      .catch(() => {
        setError('Network error')
        setState('error')
      })
  }, [searchParams])

  if (state === 'verifying') {
    return (
      <AuthShell
        eyebrow="Verification"
        title="Verifying your email"
        subtitle="Please wait while we verify your email address."
      >
        <StateIcon variant="primary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </StateIcon>
        <div className="mt-7 flex items-center justify-center">
          <div className="h-1 w-40 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] to-[oklch(0.55_0.24_270)]" />
          </div>
        </div>
      </AuthShell>
    )
  }

  if (state === 'provisioning') {
    return (
      <AuthShell
        eyebrow="Setting up"
        title="Crafting your platform"
        subtitle="This usually takes less than a minute."
      >
        <StateIcon variant="primary">
          <Rocket className="h-6 w-6" />
        </StateIcon>
        <div className="mt-7 flex items-center justify-center gap-2 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Creating <strong className="text-foreground">{domain || slug}</strong>
          </span>
        </div>
      </AuthShell>
    )
  }

  if (state === 'ready') {
    return (
      <AuthShell
        eyebrow="Ready"
        title="Your platform is ready"
        subtitle="Sign in on your new platform to start adding content."
      >
        <StateIcon variant="success">
          <CheckCircle2 className="h-6 w-6" />
        </StateIcon>
        <Button asChild variant="brand" size="lg" className="mt-7 w-full">
          <a href={`http://${domain}`}>Open {domain} →</a>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Error"
      title="Something went wrong"
      subtitle={error}
    >
      <StateIcon variant="destructive">
        <AlertCircle className="h-6 w-6" />
      </StateIcon>
      <Button asChild variant="outline" size="lg" className="mt-7 w-full">
        <a href="/signup">Try again</a>
      </Button>
    </AuthShell>
  )
}
