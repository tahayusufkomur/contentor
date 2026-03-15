'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MagicLinkForm } from '@/components/auth/magic-link-form'
import { useTenant } from '@/hooks/use-tenant'
import { BookOpen } from 'lucide-react'

export default function LoginPage() {
  const config = useTenant()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {config?.logo_url ? (
              <img src={config.logo_url} alt={config.brand_name} className="h-8 w-auto" />
            ) : (
              <BookOpen className="h-6 w-6 text-primary" />
            )}
          </div>
          <div>
            <CardTitle className="text-xl">
              Welcome to {config?.brand_name || 'your account'}
            </CardTitle>
            <CardDescription className="mt-1">
              Sign in with your email to continue
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <MagicLinkForm />
        </CardContent>
      </Card>
    </div>
  )
}
