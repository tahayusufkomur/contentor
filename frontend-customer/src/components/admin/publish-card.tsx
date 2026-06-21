'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Globe, KeyRound, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { clientFetch } from '@/lib/api-client'

interface MeTenant {
  slug: string
  name: string
  is_published: boolean
  has_preview_password: boolean
  studio_url: string
}

function pickCurrentTenant(tenants: MeTenant[]): MeTenant | null {
  if (tenants.length === 0) return null
  if (typeof window !== 'undefined') {
    const match = tenants.find((t) => {
      try {
        return new URL(t.studio_url).host === window.location.host
      } catch {
        return false
      }
    })
    if (match) return match
  }
  return tenants.length === 1 ? tenants[0] : null
}

export function PublishCard() {
  const [tenant, setTenant] = useState<MeTenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')

  useEffect(() => {
    clientFetch<MeTenant[]>('/api/v1/me/tenants/')
      .then((list) => setTenant(pickCurrentTenant(list)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    if (!tenant) return false
    setBusy(true)
    try {
      const updated = await clientFetch<Partial<MeTenant>>(
        `/api/v1/me/tenants/${tenant.slug}/`,
        { method: 'PATCH', body: JSON.stringify(body) },
      )
      setTenant((prev) => (prev ? { ...prev, ...updated } : prev))
      return true
    } catch {
      toast.error('Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (await patch({ is_published: true })) toast.success('Your app is live 🎉')
  }

  async function unpublish() {
    if (!window.confirm('Your site will be hidden from students until you publish again.')) return
    await patch({ is_published: false })
  }

  async function savePassword() {
    const value = pw.trim()
    if (!value) return
    if (await patch({ preview_password: value })) {
      setPw('')
      toast.success('Preview password saved')
    }
  }

  async function clearPassword() {
    if (await patch({ preview_password: '' })) toast.success('Preview password cleared')
  }

  function copyLink() {
    if (!tenant) return
    void navigator.clipboard?.writeText(tenant.studio_url)
    toast.success('Link copied')
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    )
  }

  if (!tenant) return null

  return (
    <Card className={tenant.is_published ? '' : 'border-amber-300 bg-amber-50/40'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {tenant.is_published ? (
            <>
              <Globe className="h-4 w-4 text-emerald-600" /> Your app is live
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4 text-amber-600" /> Publish your app
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.is_published ? (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-emerald-600">● Live</span> — students can find and
              install your app.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={tenant.studio_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View site
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
              <Button variant="outline" size="sm" onClick={unpublish} disabled={busy}>
                Unpublish
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Your app is hidden behind a preview gate. Publish it to let students find and install
              it.
            </p>
            <Button onClick={publish} disabled={busy} className="gap-2">
              <Rocket className="h-4 w-4" /> Publish app — go live
            </Button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Preview link:</span>
              <code className="rounded bg-muted px-1.5 py-0.5">{tenant.studio_url}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2"
                onClick={copyLink}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
          </>
        )}

        {/* Preview password */}
        <div className="space-y-2 border-t pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" /> Preview password
            {tenant.has_preview_password ? ' — set' : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={tenant.has_preview_password ? 'Change password' : 'Set a password'}
              className="h-9 w-48"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={savePassword}
              disabled={busy || !pw.trim()}
            >
              Save
            </Button>
            {tenant.has_preview_password && (
              <Button variant="ghost" size="sm" onClick={clearPassword} disabled={busy}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Share the preview link + password to let others see the site before you publish.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
