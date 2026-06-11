'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Globe, Mail, CreditCard, Calendar, ExternalLink } from 'lucide-react'
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
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  billing_currency: string
  iyzico_submerchant_id: string
  created_at: string
  platform_subscription: {
    plan: string
    status: string
    provider: string
    cancel_at_period_end: boolean
    current_period_end: string | null
  } | null
  usage: {
    month: string
    student_count: number
    storage_bytes: number
    streaming_minutes: number
    emails_sent: number
  } | null
  marketplace: {
    gross_by_currency: Record<string, string>
    fees_by_currency: Record<string, string>
    payment_count: number
  }
}

function currencyMap(map: Record<string, string> | undefined): string {
  if (!map) return '\u2014'
  const parts = Object.entries(map).map(([cur, amount]) => `${amount} ${cur}`)
  return parts.length ? parts.join(' \u00b7 ') : '\u2014'
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
          <Button asChild variant="outline" size="sm">
            <a href={`http://${tenant.subdomain}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" />
              Open site
            </a>
          </Button>
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

      {/* Monetization */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monetization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Platform subscription</p>
              {tenant.platform_subscription ? (
                <div className="text-right">
                  <Badge
                    variant={tenant.platform_subscription.status === 'active' ? 'success' : 'warning'}
                  >
                    {tenant.platform_subscription.plan} · {tenant.platform_subscription.status}
                    {tenant.platform_subscription.cancel_at_period_end ? ' · canceling' : ''}
                  </Badge>
                  {tenant.platform_subscription.current_period_end && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      renews {new Date(tenant.platform_subscription.current_period_end).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ) : (
                <Badge variant="secondary">free</Badge>
              )}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Accepting payments</p>
              <Badge variant={tenant.stripe_charges_enabled ? 'success' : 'secondary'}>
                {tenant.stripe_charges_enabled ? 'enabled' : 'not set up'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Payouts</p>
              <Badge variant={tenant.stripe_payouts_enabled ? 'success' : 'secondary'}>
                {tenant.stripe_payouts_enabled ? 'enabled' : 'not set up'}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Sales volume</p>
              <p className="text-sm tabular-nums text-foreground">
                {currencyMap(tenant.marketplace?.gross_by_currency)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Platform fees earned</p>
              <p className="text-sm tabular-nums text-foreground">
                {currencyMap(tenant.marketplace?.fees_by_currency)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Payments</p>
              <p className="text-sm tabular-nums text-foreground">
                {tenant.marketplace?.payment_count ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.usage ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Month</p>
                  <p className="text-sm text-foreground">{tenant.usage.month}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Students</p>
                  <p className="text-sm tabular-nums text-foreground">{tenant.usage.student_count}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Storage</p>
                  <p className="text-sm tabular-nums text-foreground">
                    {(tenant.usage.storage_bytes / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Streaming minutes</p>
                  <p className="text-sm tabular-nums text-foreground">{tenant.usage.streaming_minutes}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Emails sent</p>
                  <p className="text-sm tabular-nums text-foreground">{tenant.usage.emails_sent}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
