'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Globe, Mail, CreditCard, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

interface TenantDetail {
  id: number
  name: string
  slug: string
  owner_email: string
  is_active: boolean
  provisioning_status: string
  plan_name: string | null
  subdomain: string
  stripe_account_id: string
  iyzico_submerchant_id: string
  created_at: string
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <Skeleton className="h-6 w-40" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' {
  if (status === 'ready') return 'success'
  if (status === 'pending' || status === 'provisioning') return 'warning'
  return 'destructive'
}

export default function TenantDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/platform/tenants/${slug}/`, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load tenant')
        return res.json()
      })
      .then(setTenant)
      .catch((err) => setError(err.message))
  }, [slug])

  async function toggleActive() {
    if (!tenant) return
    setToggling(true)
    try {
      const res = await fetch(`/api/v1/platform/tenants/${slug}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tenant.is_active }),
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('Failed to update tenant')
      const data = await res.json()
      setTenant(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setToggling(false)
    }
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (!tenant) {
    return <DetailSkeleton />
  }

  const infoFields = [
    { label: 'Subdomain', value: tenant.subdomain, icon: Globe },
    { label: 'Owner Email', value: tenant.owner_email, icon: Mail },
    { label: 'Stripe Account', value: tenant.stripe_account_id || 'Not connected', icon: CreditCard },
    { label: 'Iyzico Submerchant', value: tenant.iyzico_submerchant_id || 'Not connected', icon: CreditCard },
    { label: 'Created', value: new Date(tenant.created_at).toLocaleString(), icon: Calendar },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Breadcrumb-style back link */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Tenants
        </Link>
        <span>/</span>
        <span className="text-foreground">{tenant.name}</span>
      </div>

      {/* Tenant header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{tenant.name}</h1>
            <Badge variant={tenant.is_active ? 'success' : 'destructive'}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {tenant.is_active ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={tenant.is_active}
            onCheckedChange={toggleActive}
            disabled={toggling}
          />
        </div>
      </div>

      {/* Tenant info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tenant Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Plan */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Plan</p>
              <div className="mt-1">
                <Badge variant="secondary">{tenant.plan_name || 'None'}</Badge>
              </div>
            </div>

            {/* Provisioning Status */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Provisioning Status</p>
              <div className="mt-1">
                <Badge variant={statusBadgeVariant(tenant.provisioning_status)}>
                  {tenant.provisioning_status}
                </Badge>
              </div>
            </div>

            <Separator className="col-span-full" />

            {/* Info fields */}
            {infoFields.map((field) => {
              const Icon = field.icon
              return (
                <div key={field.label}>
                  <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-foreground">{field.value}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
