'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

type SignupState = 'form' | 'email-sent' | 'error'

export default function SignupPage() {
  const [brandName, setBrandName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState<SignupState>('form')

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
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Something went wrong')
        setLoading(false)
        return
      }
      setState('email-sent')
      setLoading(false)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (state === 'email-sent') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PlatformHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-md text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Check your email</CardTitle>
              <CardDescription>
                We sent a verification link to <strong className="text-foreground">{email}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the link in your email to verify and create <strong className="text-foreground">{brandName}</strong>.
                The link expires in 15 minutes.
              </p>
            </CardContent>
          </Card>
        </div>
        <PlatformFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Start your free trial</CardTitle>
            <CardDescription>Set up your branded platform in minutes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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
              {error && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {loading ? 'Creating...' : 'Create My Platform'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
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
