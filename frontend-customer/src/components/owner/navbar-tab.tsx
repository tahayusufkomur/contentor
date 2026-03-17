'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import type { TenantConfig, NavLink, NavbarConfig } from '@/types/tenant'

interface NavbarTabProps {
  config: TenantConfig
  onSaved: (updated: Partial<TenantConfig>) => void
}

export function NavbarTab({ config, onSaved }: NavbarTabProps) {
  const initial = config.navbar_config ?? { links: [], cta: null, show_login: true }
  const [links, setLinks] = useState<NavLink[]>(initial.links ?? [])
  const [ctaEnabled, setCtaEnabled] = useState(!!initial.cta)
  const [ctaText, setCtaText] = useState(initial.cta?.text ?? 'Get Started')
  const [ctaHref, setCtaHref] = useState(initial.cta?.href ?? '/courses')
  const [showLogin, setShowLogin] = useState(initial.show_login !== false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const addLink = () => setLinks([...links, { label: '', href: '' }])
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))
  const updateLink = (i: number, field: 'label' | 'href', value: string) =>
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const handleSave = async () => {
    setSaving(true)
    const navbar_config: NavbarConfig = {
      links,
      cta: ctaEnabled ? { text: ctaText, href: ctaHref } : null,
      show_login: showLogin,
    }
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ navbar_config }),
      })
      if (res.ok) {
        const updated = await res.json()
        onSaved(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Nav links */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Navigation links</Label>
          <button onClick={addLink} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add link
          </button>
        </div>
        {links.length === 0 && (
          <p className="text-xs text-muted-foreground">No links yet. Add one above.</p>
        )}
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateLink(i, 'label', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="/path"
                value={link.href}
                onChange={(e) => updateLink(i, 'href', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CTA button */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>CTA button</Label>
          <Switch checked={ctaEnabled} onCheckedChange={setCtaEnabled} />
        </div>
        {ctaEnabled && (
          <div className="space-y-2">
            <Input placeholder="Button text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
            <Input placeholder="/courses" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
          </div>
        )}
      </div>

      {/* Show login */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show login button</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Display "Sign In" link in nav</p>
        </div>
        <Switch checked={showLogin} onCheckedChange={setShowLogin} />
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save navbar'}
      </Button>
    </div>
  )
}
