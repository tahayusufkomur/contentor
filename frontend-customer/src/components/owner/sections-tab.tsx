'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Check, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TenantConfig, LandingSections } from '@/types/tenant'

interface SectionsTabProps {
  config: TenantConfig
  onSaved: (updated: Partial<TenantConfig>) => void
}

function SectionRow({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {children && (
            <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-180')} />
            </button>
          )}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {open && enabled && children && (
        <div className="border-t bg-accent/20 px-4 py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

export function SectionsTab({ config, onSaved }: SectionsTabProps) {
  const init = config.landing_sections ?? {}
  const [sections, setSections] = useState<LandingSections>({
    hero: init.hero ?? { enabled: true, headline: '', subheadline: '', cta_text: 'Browse Courses', cta_href: '/courses', bg_image_url: null },
    about: init.about ?? { enabled: false, heading: 'About Me', body: '', image_url: null },
    courses: init.courses ?? { enabled: true, heading: 'Featured Courses' },
    testimonials: init.testimonials ?? { enabled: false, heading: 'What students say', items: [] },
    faq: init.faq ?? { enabled: false, heading: 'FAQ', items: [] },
    cta: init.cta ?? { enabled: true, heading: 'Ready to start?', button_text: 'Join Now', button_href: '/courses' },
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const update = <K extends keyof LandingSections>(key: K, patch: Partial<LandingSections[K] & object>) =>
    setSections((s) => ({ ...s, [key]: { ...(s[key] as object), ...patch } }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_sections: sections }),
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

  const hero = sections.hero!
  const about = sections.about!
  const courses = sections.courses!
  const testimonials = sections.testimonials!
  const faq = sections.faq!
  const cta = sections.cta!

  return (
    <div className="space-y-3">
      {/* Hero */}
      <SectionRow label="Hero" enabled={hero.enabled} onToggle={(v) => update('hero', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Headline</Label>
            <Input value={hero.headline} onChange={(e) => update('hero', { headline: e.target.value })} placeholder="Welcome to my platform" />
          </div>
          <div>
            <Label className="text-xs">Subheadline</Label>
            <Input value={hero.subheadline} onChange={(e) => update('hero', { subheadline: e.target.value })} placeholder="A short description" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">CTA text</Label>
              <Input value={hero.cta_text} onChange={(e) => update('hero', { cta_text: e.target.value })} placeholder="Browse Courses" />
            </div>
            <div>
              <Label className="text-xs">CTA link</Label>
              <Input value={hero.cta_href} onChange={(e) => update('hero', { cta_href: e.target.value })} placeholder="/courses" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Background image URL (optional)</Label>
            <Input value={hero.bg_image_url ?? ''} onChange={(e) => update('hero', { bg_image_url: e.target.value || null })} placeholder="https://..." />
          </div>
        </div>
      </SectionRow>

      {/* About */}
      <SectionRow label="About" enabled={about.enabled} onToggle={(v) => update('about', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={about.heading} onChange={(e) => update('about', { heading: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Body text</Label>
            <textarea
              value={about.body}
              onChange={(e) => update('about', { body: e.target.value })}
              rows={4}
              placeholder="Tell students about yourself…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 resize-none"
            />
          </div>
          <div>
            <Label className="text-xs">Image URL (optional)</Label>
            <Input value={about.image_url ?? ''} onChange={(e) => update('about', { image_url: e.target.value || null })} placeholder="https://..." />
          </div>
        </div>
      </SectionRow>

      {/* Courses */}
      <SectionRow label="Courses grid" enabled={courses.enabled} onToggle={(v) => update('courses', { enabled: v })}>
        <div>
          <Label className="text-xs">Section heading</Label>
          <Input value={courses.heading} onChange={(e) => update('courses', { heading: e.target.value })} />
        </div>
      </SectionRow>

      {/* Testimonials */}
      <SectionRow label="Testimonials" enabled={testimonials.enabled} onToggle={(v) => update('testimonials', { enabled: v })}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={testimonials.heading} onChange={(e) => update('testimonials', { heading: e.target.value })} />
          </div>
          <div className="space-y-2">
            {testimonials.items.map((item, i) => (
              <div key={i} className="rounded border p-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Testimonial {i + 1}</span>
                  <button onClick={() => update('testimonials', { items: testimonials.items.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input placeholder="Name" value={item.name} onChange={(e) => update('testimonials', { items: testimonials.items.map((t, j) => j === i ? { ...t, name: e.target.value } : t) })} />
                <textarea
                  placeholder="What they said…"
                  value={item.text}
                  onChange={(e) => update('testimonials', { items: testimonials.items.map((t, j) => j === i ? { ...t, text: e.target.value } : t) })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>
            ))}
            <button
              onClick={() => update('testimonials', { items: [...testimonials.items, { name: '', text: '', avatar_url: '' }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add testimonial
            </button>
          </div>
        </div>
      </SectionRow>

      {/* FAQ */}
      <SectionRow label="FAQ" enabled={faq.enabled} onToggle={(v) => update('faq', { enabled: v })}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={faq.heading} onChange={(e) => update('faq', { heading: e.target.value })} />
          </div>
          <div className="space-y-2">
            {faq.items.map((item, i) => (
              <div key={i} className="rounded border p-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Q{i + 1}</span>
                  <button onClick={() => update('faq', { items: faq.items.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input placeholder="Question" value={item.q} onChange={(e) => update('faq', { items: faq.items.map((f, j) => j === i ? { ...f, q: e.target.value } : f) })} />
                <Input placeholder="Answer" value={item.a} onChange={(e) => update('faq', { items: faq.items.map((f, j) => j === i ? { ...f, a: e.target.value } : f) })} />
              </div>
            ))}
            <button
              onClick={() => update('faq', { items: [...faq.items, { q: '', a: '' }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </div>
        </div>
      </SectionRow>

      {/* CTA */}
      <SectionRow label="Call to action" enabled={cta.enabled} onToggle={(v) => update('cta', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={cta.heading} onChange={(e) => update('cta', { heading: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Button text</Label>
              <Input value={cta.button_text} onChange={(e) => update('cta', { button_text: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Button link</Label>
              <Input value={cta.button_href} onChange={(e) => update('cta', { button_href: e.target.value })} />
            </div>
          </div>
        </div>
      </SectionRow>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save sections'}
      </Button>
    </div>
  )
}
