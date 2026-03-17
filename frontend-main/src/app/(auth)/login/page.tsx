'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MagicLinkForm } from '@/components/auth/magic-link-form'

const GOOGLE_ERRORS: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  invalid_request: 'Invalid request. Please try again.',
  invalid_state: 'Session expired. Please try again.',
  tenant_mismatch: 'Authentication error. Please try again.',
  token_exchange_failed: 'Could not connect to Google. Please try again.',
  userinfo_failed: 'Could not retrieve your Google profile. Please try again.',
  no_email: 'No email associated with this Google account.',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const googleError = searchParams.get('error')

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
            Contentor
          </Link>
          <CardTitle className="mt-2 text-lg">Platform Admin</CardTitle>
          <CardDescription>Sign in to manage your platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleError && (
            <p className="text-sm text-destructive text-center">
              {GOOGLE_ERRORS[googleError] || 'Something went wrong. Please try again.'}
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const res = await fetch('/api/v1/auth/google/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: window.location.origin }),
                credentials: 'same-origin',
              })
              if (res.ok) {
                const data = await res.json()
                window.location.href = data.url
              }
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <MagicLinkForm />
        </CardContent>
      </Card>
    </div>
  )
}
