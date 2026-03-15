'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

type SignupState = 'form' | 'provisioning' | 'ready' | 'error'

export default function SignupPage() {
  const [brandName, setBrandName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState<SignupState>('form')
  const [slug, setSlug] = useState('')
  const [domain, setDomain] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/onboarding/signup/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName, name, email }),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.detail || 'Something went wrong')
        setLoading(false)
        return
      }
      const data = await res.json()
      setSlug(data.slug)
      setDomain(data.domain)
      setState('provisioning')
      setLoading(false)

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
              setState('error')
              setError('Provisioning failed. Please contact support.')
            }
          }
        } catch {
          // Keep polling
        }
      }, 3000)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (state === 'ready') {
    return (
      <div className="flex min-h-screen flex-col">
        <PlatformHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Your app is ready!</CardTitle>
              <CardDescription>Your branded platform has been set up successfully.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">Check your email for login instructions.</p>
              <Button asChild className="w-full">
                <a href={`http://${domain}`}>Go to {domain}</a>
              </Button>
            </CardContent>
          </Card>
        </div>
        <PlatformFooter />
      </div>
    )
  }

  if (state === 'provisioning') {
    return (
      <div className="flex min-h-screen flex-col">
        <PlatformHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle>Setting up your platform...</CardTitle>
              <CardDescription>This usually takes less than a minute.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Creating {slug}.contentor.localhost</p>
            </CardContent>
          </Card>
        </div>
        <PlatformFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Start your free trial</CardTitle>
            <CardDescription>Set up your branded platform in minutes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  placeholder="My Awesome Academy"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating...' : 'Create My Platform'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
      <PlatformFooter />
    </div>
  )
}
