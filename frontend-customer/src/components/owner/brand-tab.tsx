'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2, Upload } from 'lucide-react'
import type { TenantConfig } from '@/types/tenant'

const FONTS = ['Inter', 'Geist', 'Poppins', 'Nunito', 'DM Sans', 'Playfair Display', 'Merriweather', 'Lora']

interface BrandTabProps {
  config: TenantConfig
  onSaved: (updated: Partial<TenantConfig>) => void
}

export function BrandTab({ config, onSaved }: BrandTabProps) {
  const [brandName, setBrandName] = useState(config.brand_name)
  const [logoUrl, setLogoUrl] = useState(config.logo_url)
  const [primaryColor, setPrimaryColor] = useState(config.primary_color)
  const [secondaryColor, setSecondaryColor] = useState(config.secondary_color)
  const [fontFamily, setFontFamily] = useState(config.font_family)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName, logo_url: logoUrl, primary_color: primaryColor, secondary_color: secondaryColor, font_family: fontFamily }),
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
      <div className="space-y-1.5">
        <Label htmlFor="brand-name">Brand name</Label>
        <Input id="brand-name" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="My Platform" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logo-url">Logo URL</Label>
        <div className="flex gap-2">
          <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>
        {logoUrl && (
          <img src={logoUrl} alt="Logo preview" className="h-10 w-auto rounded object-contain mt-1" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="primary-color">Primary color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="primary-color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
            />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="secondary-color">Secondary</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="secondary-color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
            />
            <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Font family</Label>
        <div className="flex flex-wrap gap-2">
          {FONTS.map((font) => (
            <button
              key={font}
              onClick={() => setFontFamily(font)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${fontFamily === font ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}
            >
              {font}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : null}
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save brand'}
      </Button>
    </div>
  )
}
