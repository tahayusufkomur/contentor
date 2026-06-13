'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Search, Trash2, Pencil } from 'lucide-react'
import { PAGE_KEYS, PAGE_LABELS, PAGE_ROUTES } from '@/lib/blocks/pages'
import type { TenantConfig, NavbarConfig } from '@/types/tenant'

interface NavbarTabProps {
  config: TenantConfig
  onChange: (patch: Partial<TenantConfig>) => void
}

// Built-in destinations the coach can drop into the nav without typing a URL.
const AVAILABLE_LINKS: { label: string; href: string }[] = [
  ...PAGE_KEYS.map((key) => ({ label: PAGE_LABELS[key], href: PAGE_ROUTES[key] })),
  { label: 'Store', href: '/store' },
  { label: 'Calendar', href: '/calendar' },
]

export function NavbarTab({ config, onChange }: NavbarTabProps) {
  const navbar = config.navbar_config ?? { links: [], cta: null, show_login: true }
  const links = navbar.links ?? []
  const ctaEnabled = !!navbar.cta
  const ctaText = navbar.cta?.text ?? 'Get Started'
  const ctaHref = navbar.cta?.href ?? '/courses'
  const showLogin = navbar.show_login !== false

  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const emit = (patch: Partial<NavbarConfig>) => {
    onChange({ navbar_config: { ...navbar, ...patch } })
  }

  const updateLink = (i: number, field: 'label' | 'href', value: string) => {
    emit({ links: links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) })
  }
  const removeLink = (i: number) => emit({ links: links.filter((_, idx) => idx !== i) })
  const addLink = (link: { label: string; href: string }) => {
    emit({ links: [...links, link] })
    setAdding(false)
    setSearch('')
  }

  const suggestions = useMemo(() => {
    const taken = new Set(links.map((l) => l.href))
    const q = search.trim().toLowerCase()
    return AVAILABLE_LINKS.filter(
      (p) => !taken.has(p.href) && (!q || p.label.toLowerCase().includes(q) || p.href.toLowerCase().includes(q)),
    )
  }, [links, search])

  return (
    <div className="space-y-5">
      {/* Nav links */}
      <div className="space-y-2">
        <Label>Navigation links</Label>
        {links.length === 0 && <p className="text-xs text-muted-foreground">No links yet. Add one below.</p>}
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
              <button
                onClick={() => removeLink(i)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                title="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add link: pick a page (searchable) or add a custom link */}
        {adding ? (
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search pages…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {suggestions.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">No matching pages.</p>
              ) : (
                suggestions.map((p) => (
                  <button
                    key={p.href}
                    onClick={() => addLink(p)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span>{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.href}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <button
                onClick={() => addLink({ label: '', href: '' })}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Add custom link
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  setSearch('')
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add link
          </button>
        )}
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
          <p className="mt-0.5 text-xs text-muted-foreground">Display &quot;Sign In&quot; link in nav</p>
        </div>
        <Switch checked={showLogin} onCheckedChange={(v) => emit({ show_login: v })} />
      </div>
    </div>
  )
}
