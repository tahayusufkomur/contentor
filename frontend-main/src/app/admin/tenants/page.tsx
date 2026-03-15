'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Tenant } from '@/types/tenant'

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/tenants/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load tenants')
        return res.json()
      })
      .then(setTenants)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-destructive">{error}</p>
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Tenants</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-muted-foreground">Loading tenants...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Name</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Slug</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Plan</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/admin/tenants/${tenant.slug}`} className="text-primary hover:underline">
                          {tenant.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{tenant.slug}</td>
                      <td className="py-3 pr-4">{tenant.plan_name || '-'}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            tenant.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {tenant.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
