'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientFetch } from '@/lib/api-client'
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
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (!config) return <p>Loading...</p>

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Design Settings</h1>
      <Card>
        <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Brand Name</Label><Input value={config.brand_name} onChange={(e) => setConfig({ ...config, brand_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Primary Color</Label><div className="flex gap-2"><input type="color" value={config.primary_color} onChange={(e) => setConfig({ ...config, primary_color: e.target.value })} className="h-10 w-10 cursor-pointer rounded border" /><Input value={config.primary_color} onChange={(e) => setConfig({ ...config, primary_color: e.target.value })} /></div></div>
            <div className="space-y-2"><Label>Secondary Color</Label><div className="flex gap-2"><input type="color" value={config.secondary_color} onChange={(e) => setConfig({ ...config, secondary_color: e.target.value })} className="h-10 w-10 cursor-pointer rounded border" /><Input value={config.secondary_color} onChange={(e) => setConfig({ ...config, secondary_color: e.target.value })} /></div></div>
          </div>
          <div className="space-y-2"><Label>Font Family</Label><Input value={config.font_family} onChange={(e) => setConfig({ ...config, font_family: e.target.value })} placeholder="Inter" /></div>
          <div className="space-y-2"><Label>Logo URL</Label><Input value={config.logo_url} onChange={(e) => setConfig({ ...config, logo_url: e.target.value })} placeholder="https://..." /></div>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
