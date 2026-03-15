'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
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

    // Step 1: Verify email and create tenant
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

        // Step 2: Poll provisioning status
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
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        {state === 'verifying' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Verifying your email...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            </CardContent>
          </Card>
        )}

        {state === 'provisioning' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Email verified! Setting up your platform...</CardTitle>
              <CardDescription>This usually takes less than a minute.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Creating {slug}.contentor.localhost</p>
            </CardContent>
          </Card>
        )}

        {state === 'ready' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Your platform is ready!</CardTitle>
              <CardDescription>Your branded platform has been created successfully.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in on your new platform to start adding content.
              </p>
              <Button asChild className="w-full">
                <a href={`http://${domain}`}>Go to {domain}</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {state === 'error' && (
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline" className="mt-4">
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
