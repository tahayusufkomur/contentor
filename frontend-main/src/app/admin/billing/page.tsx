'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PlatformSubscriptionRow } from '@/types/tenant'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  active: 'success',
  past_due: 'warning',
  incomplete: 'secondary',
  canceled: 'destructive',
}

export default function BillingPage() {
  const [subs, setSubs] = useState<PlatformSubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/subscriptions/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load subscriptions')
        return res.json()
      })
      .then(setSubs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Coach subscriptions to the platform. Marketplace fee totals live on the dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Platform Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : subs.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No subscriptions yet"
              description="Coach subscriptions will appear here once tenants upgrade to a paid plan."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Provider</TableHead>
                  <TableHead className="text-right">Renews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link
                        href={`/admin/tenants/${sub.tenant_slug}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {sub.tenant_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{sub.tenant_slug}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{sub.plan}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {sub.amount} {sub.currency}/mo
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[sub.status] ?? 'secondary'}>
                        {sub.status.replace('_', ' ')}
                        {sub.cancel_at_period_end ? ' · canceling' : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {sub.provider}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
