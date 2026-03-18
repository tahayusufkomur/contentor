'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TenantConfig, LandingSections } from '@/types/tenant'

interface SectionsTabProps {
  config: TenantConfig
  onChange: (patch: Partial<TenantConfig>) => void
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

export function SectionsTab({ config, onChange }: SectionsTabProps) {
  const sections = config.landing_sections ?? {}
  const hero = sections.hero ?? { enabled: true, headline: '', subheadline: '', cta_text: 'Browse Courses', cta_href: '/courses', bg_image_url: null }
  const about = sections.about ?? { enabled: false, heading: 'About Me', body: '', image_url: null }
  const courses = sections.courses ?? { enabled: true, heading: 'Featured Courses' }
  const testimonials = sections.testimonials ?? { enabled: false, heading: 'What students say', items: [] }
  const faq = sections.faq ?? { enabled: false, heading: 'FAQ', items: [] }
  const cta = sections.cta ?? { enabled: true, heading: 'Ready to start?', button_text: 'Join Now', button_href: '/courses' }

  const emit = <K extends keyof LandingSections>(key: K, patch: Partial<LandingSections[K] & object>) => {
    const current = sections[key] as object ?? {}
    onChange({ landing_sections: { ...sections, [key]: { ...current, ...patch } } })
  }

  return (
    <div className="space-y-3">
      {/* Hero */}
      <SectionRow label="Hero" enabled={hero.enabled} onToggle={(v) => emit('hero', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Headline</Label>
            <Input value={hero.headline} onChange={(e) => emit('hero', { headline: e.target.value })} placeholder="Welcome to my platform" />
          </div>
          <div>
            <Label className="text-xs">Subheadline</Label>
            <Input value={hero.subheadline} onChange={(e) => emit('hero', { subheadline: e.target.value })} placeholder="A short description" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">CTA text</Label>
              <Input value={hero.cta_text} onChange={(e) => emit('hero', { cta_text: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">CTA link</Label>
              <Input value={hero.cta_href} onChange={(e) => emit('hero', { cta_href: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Background image (optional)</Label>
            <Input value={hero.bg_image_url ?? ''} onChange={(e) => emit('hero', { bg_image_url: e.target.value || null })} placeholder="https://..." />
          </div>
        </div>
      </SectionRow>

      {/* About */}
      <SectionRow label="About" enabled={about.enabled} onToggle={(v) => emit('about', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={about.heading} onChange={(e) => emit('about', { heading: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Body text</Label>
            <textarea
              value={about.body}
              onChange={(e) => emit('about', { body: e.target.value })}
              rows={4}
              placeholder="Tell students about yourself…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 resize-none"
            />
          </div>
          <div>
            <Label className="text-xs">Image URL (optional)</Label>
            <Input value={about.image_url ?? ''} onChange={(e) => emit('about', { image_url: e.target.value || null })} placeholder="https://..." />
          </div>
        </div>
      </SectionRow>

      {/* Courses */}
      <SectionRow label="Courses grid" enabled={courses.enabled} onToggle={(v) => emit('courses', { enabled: v })}>
        <div>
          <Label className="text-xs">Section heading</Label>
          <Input value={courses.heading} onChange={(e) => emit('courses', { heading: e.target.value })} />
        </div>
      </SectionRow>

      {/* Testimonials */}
      <SectionRow label="Testimonials" enabled={testimonials.enabled} onToggle={(v) => emit('testimonials', { enabled: v })}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={testimonials.heading} onChange={(e) => emit('testimonials', { heading: e.target.value })} />
          </div>
          <div className="space-y-2">
            {testimonials.items.map((item, i) => (
              <div key={i} className="rounded border p-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Testimonial {i + 1}</span>
                  <button onClick={() => emit('testimonials', { items: testimonials.items.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input placeholder="Name" value={item.name} onChange={(e) => emit('testimonials', { items: testimonials.items.map((t, j) => j === i ? { ...t, name: e.target.value } : t) })} />
                <textarea
                  placeholder="What they said…"
                  value={item.text}
                  onChange={(e) => emit('testimonials', { items: testimonials.items.map((t, j) => j === i ? { ...t, text: e.target.value } : t) })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>
            ))}
            <button
              onClick={() => emit('testimonials', { items: [...testimonials.items, { name: '', text: '', avatar_url: '' }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add testimonial
            </button>
          </div>
        </div>
      </SectionRow>

      {/* FAQ */}
      <SectionRow label="FAQ" enabled={faq.enabled} onToggle={(v) => emit('faq', { enabled: v })}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={faq.heading} onChange={(e) => emit('faq', { heading: e.target.value })} />
          </div>
          <div className="space-y-2">
            {faq.items.map((item, i) => (
              <div key={i} className="rounded border p-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Q{i + 1}</span>
                  <button onClick={() => emit('faq', { items: faq.items.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input placeholder="Question" value={item.q} onChange={(e) => emit('faq', { items: faq.items.map((f, j) => j === i ? { ...f, q: e.target.value } : f) })} />
                <Input placeholder="Answer" value={item.a} onChange={(e) => emit('faq', { items: faq.items.map((f, j) => j === i ? { ...f, a: e.target.value } : f) })} />
              </div>
            ))}
            <button
              onClick={() => emit('faq', { items: [...faq.items, { q: '', a: '' }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </div>
        </div>
      </SectionRow>

      {/* CTA */}
      <SectionRow label="Call to action" enabled={cta.enabled} onToggle={(v) => emit('cta', { enabled: v })}>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Heading</Label>
            <Input value={cta.heading} onChange={(e) => emit('cta', { heading: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Button text</Label>
              <Input value={cta.button_text} onChange={(e) => emit('cta', { button_text: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Button link</Label>
              <Input value={cta.button_href} onChange={(e) => emit('cta', { button_href: e.target.value })} />
            </div>
          </div>
        </div>
      </SectionRow>
    </div>
  )
}
