'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, CalendarClock, XCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/empty-state'
import { clientFetch } from '@/lib/api-client'
import { billingIntervalSuffix } from '@/lib/billing-interval'

interface MySubscription {
  id: number
  plan_id: number
  plan_name: string | null
  status: string
  billing_amount: string
  billing_currency: string
  billing_interval_months?: number
  cancel_at_period_end: boolean
  current_period_end: string | null
  pending_plan_name: string | null
}

interface PlanOption {
  id: number
  name: string
  price: string
  currency: string
  billing_interval_months?: number
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  past_due: 'warning',
  expired: 'secondary',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export default function SubscriptionsPage() {
  const searchParams = useSearchParams()
  const [subs, setSubs] = useState<MySubscription[]>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        clientFetch<MySubscription[]>('/api/v1/billing/subscriptions/'),
        clientFetch<PlanOption[]>('/api/v1/billing/plans/'),
      ])
      setSubs(s)
      setPlans(p)
    } catch {
      toast.error('Could not load your subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('sub') === 'success') {
      toast.success('Subscription started! It may take a moment to appear.')
    }
    load()
  }, [load, searchParams])

  async function cancel(sub: MySubscription) {
    setBusyId(sub.id)
    try {
      await clientFetch(`/api/v1/billing/subscriptions/${sub.id}/cancel/`, { method: 'POST' })
      toast.success('Subscription will cancel at the end of the period.')
      await load()
    } catch {
      toast.error('Could not cancel. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function changePlan(sub: MySubscription, planId: number) {
    setBusyId(sub.id)
    try {
      await clientFetch(`/api/v1/billing/subscriptions/${sub.id}/change-plan/`, {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId }),
      })
      toast.success('Plan change scheduled for your next billing cycle.')
      await load()
    } catch {
      toast.error('Could not change plan. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeSubs = subs.filter((s) => s.status !== 'expired')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">My Subscriptions</h1>
        <p className="mt-1 text-muted-foreground">Manage your active memberships.</p>
      </div>

      {activeSubs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No active subscriptions"
          description="Browse membership plans to unlock content."
          action={{ label: 'View plans', href: '/plans' }}
        />
      ) : (
        <div className="space-y-4">
          {activeSubs.map((sub) => {
            const otherPlans = plans.filter((p) => p.id !== sub.plan_id)
            const busy = busyId === sub.id
            return (
              <Card key={sub.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{sub.plan_name ?? 'Plan'}</CardTitle>
                    <Badge variant={STATUS_VARIANT[sub.status] ?? 'secondary'}>
                      {sub.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sub.billing_amount} {sub.billing_currency}{billingIntervalSuffix(sub.billing_interval_months)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    {sub.cancel_at_period_end ? 'Cancels on ' : 'Renews on '}
                    <span className="font-medium text-foreground">{formatDate(sub.current_period_end)}</span>
                  </p>
                  {sub.pending_plan_name && (
                    <p className="text-sm text-muted-foreground">
                      Switching to <span className="font-medium text-foreground">{sub.pending_plan_name}</span> next cycle.
                    </p>
                  )}

                  <Separator />

                  <div className="flex flex-wrap items-center gap-2">
                    {!sub.cancel_at_period_end && sub.status !== 'expired' && (
                      <Button variant="outline" size="sm" onClick={() => cancel(sub)} disabled={busy}>
                        <XCircle className="h-4 w-4" /> Cancel
                      </Button>
                    )}
                    {otherPlans.length > 0 && !sub.pending_plan_name && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                        <select
                          className="rounded-md border bg-background px-2 py-1.5 text-sm"
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (v) changePlan(sub, v)
                          }}
                          aria-label="Change plan"
                        >
                          <option value="" disabled>
                            Change plan…
                          </option>
                          {otherPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.price} {p.currency}{billingIntervalSuffix(p.billing_interval_months)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
