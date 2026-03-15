'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlatformPlan } from '@/types/tenant'

export default function PlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/plans/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load plans')
        return res.json()
      })
      .then(setPlans)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-destructive">{error}</p>
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Plans</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Platform Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-muted-foreground">Loading plans...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Name</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Price/mo</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Fee %</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Max Students</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Storage (GB)</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Streaming (hrs)</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Emails/mo</th>
                    <th className="pb-3 font-medium text-muted-foreground">Live</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{plan.name}</td>
                      <td className="py-3 pr-4">${plan.price_monthly}</td>
                      <td className="py-3 pr-4">{plan.transaction_fee_pct}%</td>
                      <td className="py-3 pr-4">{plan.max_students}</td>
                      <td className="py-3 pr-4">{plan.max_storage_gb}</td>
                      <td className="py-3 pr-4">{plan.max_streaming_hours}</td>
                      <td className="py-3 pr-4">{plan.max_campaign_emails}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            plan.is_live_enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {plan.is_live_enabled ? 'Yes' : 'No'}
                        </span>
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
