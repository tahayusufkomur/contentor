'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, AlertCircle, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

type VerifyState = 'verifying' | 'provisioning' | 'ready' | 'error'

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        {state === 'verifying' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <CardTitle className="text-xl">Verifying your email</CardTitle>
              <CardDescription>Please wait while we verify your email address.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {state === 'provisioning' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Setting up your platform</CardTitle>
              <CardDescription>This usually takes less than a minute.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Creating <strong className="text-foreground">{slug}.contentor.localhost</strong>
              </p>
            </CardContent>
          </Card>
        )}

        {state === 'ready' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-xl">Your platform is ready!</CardTitle>
              <CardDescription>Your branded platform has been created successfully.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in on your new platform to start adding content.
              </p>
              <Button asChild className="w-full" size="lg">
                <a href={`http://${domain}`}>Go to {domain}</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {state === 'error' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline">
                <a href="/signup">Try again</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <PlatformFooter />
    </div>
  )
}
