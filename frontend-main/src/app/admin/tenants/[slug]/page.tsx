'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
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
    return <p className="text-destructive">{error}</p>
  }

  if (!tenant) {
    return <p className="text-muted-foreground">Loading tenant...</p>
  }

  const fields = [
    { label: 'Name', value: tenant.name },
    { label: 'Slug', value: tenant.slug },
    { label: 'Subdomain', value: tenant.subdomain },
    { label: 'Owner Email', value: tenant.owner_email },
    { label: 'Plan', value: tenant.plan_name || 'None' },
    { label: 'Provisioning Status', value: tenant.provisioning_status },
    { label: 'Stripe Account', value: tenant.stripe_account_id || 'Not connected' },
    { label: 'Iyzico Submerchant', value: tenant.iyzico_submerchant_id || 'Not connected' },
    { label: 'Created', value: new Date(tenant.created_at).toLocaleString() },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tenant.name}</h1>
        <Button variant="outline" size="sm" onClick={() => router.push('/admin/tenants')}>
          Back to Tenants
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Tenant Details</CardTitle>
          <Button
            variant={tenant.is_active ? 'destructive' : 'default'}
            size="sm"
            onClick={toggleActive}
            disabled={toggling}
          >
            {toggling ? 'Updating...' : tenant.is_active ? 'Disable Tenant' : 'Enable Tenant'}
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label}>
                <dt className="text-sm font-medium text-muted-foreground">{field.label}</dt>
                <dd className="mt-1 text-sm">{field.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    tenant.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {tenant.is_active ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
