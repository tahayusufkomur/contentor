'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { clientFetch } from '@/lib/api-client'
import { Palette, Type, Image, Save } from 'lucide-react'
import type { TenantConfig } from '@/types/tenant'

export default function DesignSettingsPage() {
  const router = useRouter()
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    clientFetch<TenantConfig>('/api/v1/admin/config/').then(setConfig).catch(console.error)
  }, [])

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      await clientFetch('/api/v1/admin/config/', { method: 'PATCH', body: JSON.stringify(config) })
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Design Settings</h1>
          <p className="text-sm text-muted-foreground">
            Customize the look and feel of your platform.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Branding
            </CardTitle>
            <CardDescription>
              Set your brand name and logo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand_name">Brand Name</Label>
              <Input
                id="brand_name"
                value={config.brand_name}
                onChange={(e) => setConfig({ ...config, brand_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                value={config.logo_url}
                onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
                placeholder="https://..."
              />
              {config.logo_url && (
                <div className="mt-2 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                  <img
                    src={config.logo_url}
                    alt="Logo preview"
                    className="h-10 w-auto"
                  />
                  <span className="text-xs text-muted-foreground">Logo preview</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Colors
            </CardTitle>
            <CardDescription>
              Choose primary and secondary colors for your theme.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 shrink-0 rounded-md border shadow-sm"
                  style={{ backgroundColor: config.primary_color }}
                />
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  className="h-10 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <Input
                  id="primary_color"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 shrink-0 rounded-md border shadow-sm"
                  style={{ backgroundColor: config.secondary_color }}
                />
                <input
                  type="color"
                  value={config.secondary_color}
                  onChange={(e) => setConfig({ ...config, secondary_color: e.target.value })}
                  className="h-10 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <Input
                  id="secondary_color"
                  value={config.secondary_color}
                  onChange={(e) => setConfig({ ...config, secondary_color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Typography */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Typography
            </CardTitle>
            <CardDescription>
              Choose a font for your platform. Must be a Google Fonts family name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="font_family">Font Family</Label>
              <Input
                id="font_family"
                value={config.font_family}
                onChange={(e) => setConfig({ ...config, font_family: e.target.value })}
                placeholder="Inter"
              />
              {config.font_family && (
                <p
                  className="mt-2 rounded-md border bg-muted/30 p-3 text-sm"
                  style={{ fontFamily: config.font_family }}
                >
                  The quick brown fox jumps over the lazy dog.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Preview
            </CardTitle>
            <CardDescription>
              A quick preview of how your branding looks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              {/* Mock header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ backgroundColor: config.primary_color }}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: '#ffffff' }}
                >
                  {config.brand_name || 'Your Brand'}
                </span>
                <div className="flex gap-3">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    Courses
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    Sign In
                  </span>
                </div>
              </div>
              {/* Mock content */}
              <div className="bg-background p-4 text-center">
                <p
                  className="text-lg font-bold"
                  style={{ fontFamily: config.font_family || 'inherit' }}
                >
                  {config.brand_name || 'Your Brand'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your platform tagline here
                </p>
                <div className="mx-auto mt-3 w-fit rounded-md px-4 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: config.primary_color }}>
                  Browse Courses
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
