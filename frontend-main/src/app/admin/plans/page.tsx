'use client'

import { useEffect, useState } from 'react'
import { Users, HardDrive, Video, Mail, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { PlatformPlan } from '@/types/tenant'

function PlanSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/plans/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load plans')
        return res.json()
      })
      .then((data) => {
        setPlans(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Plans</h1>
        <p className="text-sm text-muted-foreground">Platform subscription plans and their limits.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading
          ? [1, 2, 3].map((i) => <PlanSkeleton key={i} />)
          : plans.map((plan) => (
              <Card key={plan.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {plan.is_live_enabled ? (
                      <Badge variant="success">Live Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">No Live</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">${plan.price_monthly}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-4" />
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Max Students:</span>
                      <span className="ml-auto font-medium text-foreground">{plan.max_students}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Storage:</span>
                      <span className="ml-auto font-medium text-foreground">{plan.max_storage_gb} GB</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Streaming:</span>
                      <span className="ml-auto font-medium text-foreground">{plan.max_streaming_hours} hrs</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Emails/mo:</span>
                      <span className="ml-auto font-medium text-foreground">{plan.max_campaign_emails.toLocaleString()}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Transaction Fee:</span>
                      <span className="ml-auto font-medium text-foreground">{plan.transaction_fee_pct}%</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  )
}
