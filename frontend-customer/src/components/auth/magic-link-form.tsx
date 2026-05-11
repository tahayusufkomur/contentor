'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MagicLinkForm() {
  const t = useTranslations('student.auth')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/auth/magic-link/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'same-origin',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || t('magicLinkError'))
        return
      }
      if (data.demo_redirect) {
        window.location.href = data.demo_redirect
        return
      }
      setSent(true)
    } catch {
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t('magicLinkSentTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.rich('magicLinkSentBody', {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('magicLinkLabel')}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t('magicLinkPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('magicLinkSubmitting') : t('magicLinkSubmit')}
      </Button>
    </form>
  )
}
