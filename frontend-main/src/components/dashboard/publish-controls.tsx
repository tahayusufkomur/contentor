'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface PublishControlsProps {
  slug: string
  initialPublished: boolean
  initialHasPassword: boolean
}

async function patchTenant(slug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/tenants/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

export function PublishControls({ slug, initialPublished, initialHasPassword }: PublishControlsProps) {
  const [published, setPublished] = useState(initialPublished)
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const [password, setPassword] = useState('')
  const [togglingVisibility, setTogglingVisibility] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState(false)
  const [error, setError] = useState(false)

  const toggleVisibility = async (next: boolean) => {
    setTogglingVisibility(true)
    setError(false)
    const prev = published
    setPublished(next)
    try {
      await patchTenant(slug, { is_published: next })
    } catch {
      setPublished(prev)
      setError(true)
    } finally {
      setTogglingVisibility(false)
    }
  }

  const savePassword = async () => {
    setSavingPassword(true)
    setError(false)
    setSavedPassword(false)
    try {
      await patchTenant(slug, { preview_password: password })
      setHasPassword(password.length > 0)
      setPassword('')
      setSavedPassword(true)
      setTimeout(() => setSavedPassword(false), 2000)
    } catch {
      setError(true)
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="mt-5 space-y-3 rounded-xl border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {published ? (
            <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">{published ? 'Live to everyone' : 'Hidden — preview only'}</p>
            <p className="text-[12px] text-muted-foreground">
              {published ? 'Your site is public.' : 'Visitors see a preview gate until you publish.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {togglingVisibility && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch checked={published} onCheckedChange={toggleVisibility} disabled={togglingVisibility} />
        </div>
      </div>

      {!published && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <label className="text-[12px] font-medium text-muted-foreground">
            Preview password {hasPassword && <span className="text-emerald-600 dark:text-emerald-400">· set</span>}
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasPassword ? 'Set a new password' : 'Add a password'}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={savePassword} disabled={savingPassword}>
              {savingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedPassword ? <Check className="h-3.5 w-3.5" /> : 'Save'}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Share this password to let others preview before launch. Leave empty and save to clear it.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-destructive">Couldn&apos;t save. Try again.</p>}
    </div>
  )
}
