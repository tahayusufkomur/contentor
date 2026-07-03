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
  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')

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

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCodeLoading(true)
    setCodeError('')
    try {
      const res = await fetch('/api/v1/auth/magic-link/verify-code/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setCodeError(t('codeError'))
        return
      }
      setCode('')
      window.location.href = '/'
      return
    } catch {
      setCodeError(t('networkError'))
    } finally {
      setCodeLoading(false)
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
        <form onSubmit={handleCodeSubmit} className="mt-6 space-y-3 text-left">
          <Label htmlFor="login-code">{t('codeHint')}</Label>
          <Input
            id="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-xl tracking-[0.5em]"
          />
          {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          <Button type="submit" className="w-full" disabled={codeLoading || code.length !== 6}>
            {codeLoading ? t('codeSubmitting') : t('codeSubmit')}
          </Button>
        </form>
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
