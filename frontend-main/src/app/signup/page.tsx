'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

type SignupState = 'form' | 'email-sent' | 'error'

export default function SignupPage() {
  const t = useTranslations('auth.signup')
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
        setError(data.detail || t('errors.generic'))
        setLoading(false)
        return
      }
      setState('email-sent')
      setLoading(false)
    } catch {
      setError(t('errors.generic'))
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
              <CardTitle className="text-xl">{t('verifyTitle')}</CardTitle>
              <CardDescription>
                {t('verifyDescription', { email })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{brandName}</strong>
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
            <CardTitle className="text-xl">{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="brandName">{t('brandNameLabel')}</Label>
                <Input
                  id="brandName"
                  placeholder={t('brandNamePlaceholder')}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t('nameLabel')}</Label>
                <Input
                  id="name"
                  placeholder={t('namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
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
                {loading ? t('submitting') : t('submit')}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t('alreadyHaveAccount')}{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  {t('signIn')}
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
