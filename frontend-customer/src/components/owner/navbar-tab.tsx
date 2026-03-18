'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2 } from 'lucide-react'
import type { TenantConfig, NavLink, NavbarConfig } from '@/types/tenant'

interface NavbarTabProps {
  config: TenantConfig
  onChange: (patch: Partial<TenantConfig>) => void
}

export function NavbarTab({ config, onChange }: NavbarTabProps) {
  const navbar = config.navbar_config ?? { links: [], cta: null, show_login: true }
  const links = navbar.links ?? []
  const ctaEnabled = !!navbar.cta
  const ctaText = navbar.cta?.text ?? 'Get Started'
  const ctaHref = navbar.cta?.href ?? '/courses'
  const showLogin = navbar.show_login !== false

  const emit = (patch: Partial<NavbarConfig>) => {
    onChange({ navbar_config: { ...navbar, ...patch } })
  }

  const updateLink = (i: number, field: 'label' | 'href', value: string) => {
    const updated = links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l))
    emit({ links: updated })
  }
  const addLink = () => emit({ links: [...links, { label: '', href: '' }] })
  const removeLink = (i: number) => emit({ links: links.filter((_, idx) => idx !== i) })

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
              <Input placeholder="Label" value={link.label} onChange={(e) => updateLink(i, 'label', e.target.value)} className="flex-1" />
              <Input placeholder="/path" value={link.href} onChange={(e) => updateLink(i, 'href', e.target.value)} className="flex-1" />
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
          <Switch
            checked={ctaEnabled}
            onCheckedChange={(v) => emit({ cta: v ? { text: ctaText, href: ctaHref } : null })}
          />
        </div>
        {ctaEnabled && (
          <div className="space-y-2">
            <Input placeholder="Button text" value={ctaText} onChange={(e) => emit({ cta: { text: e.target.value, href: ctaHref } })} />
            <Input placeholder="/courses" value={ctaHref} onChange={(e) => emit({ cta: { text: ctaText, href: e.target.value } })} />
          </div>
        )}
      </div>

      {/* Show login */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show login button</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Display "Sign In" link in nav</p>
        </div>
        <Switch checked={showLogin} onCheckedChange={(v) => emit({ show_login: v })} />
      </div>
    </div>
  )
}
