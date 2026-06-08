'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Wallet, ExternalLink, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { clientFetch } from '@/lib/api-client'

interface ConnectStatus {
  connected: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  is_paid_active: boolean
  can_monetize: boolean
}

export default function PayoutsPage() {
  const searchParams = useSearchParams()
  // Stripe redirects back with ?connect=return after onboarding; refresh live
  // so the UI reflects readiness before the account.updated webhook lands.
  const justReturned = searchParams.get('connect') === 'return'

  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await clientFetch<ConnectStatus>(
        `/api/v1/billing/connect/status/${justReturned ? '?refresh=1' : ''}`,
      )
      setStatus(data)
    } catch {
      setError('Could not load payout status.')
    } finally {
      setLoading(false)
    }
  }, [justReturned])

  useEffect(() => {
    load()
  }, [load])

  async function startOnboarding() {
    setActing(true)
    setError('')
    try {
      const { onboarding_url } = await clientFetch<{ onboarding_url: string }>(
        '/api/v1/billing/connect/onboard/',
        { method: 'POST' },
      )
      window.location.href = onboarding_url
    } catch {
      setError('Could not start onboarding. Please try again.')
      setActing(false)
    }
  }

  async function openDashboard() {
    setActing(true)
    setError('')
    try {
      const { dashboard_url } = await clientFetch<{ dashboard_url: string }>(
        '/api/v1/billing/connect/dashboard/',
      )
      window.open(dashboard_url, '_blank', 'noopener')
    } catch {
      setError('Could not open the Stripe dashboard.')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Connect a Stripe account to get paid by your students. Stripe handles bank details and
          payouts; you remain the merchant of record.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-9 w-48" />
          </CardContent>
        </Card>
      ) : !status?.is_paid_active ? (
        <UpgradeGate />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Stripe payouts</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {!status.connected ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t connected a payout account yet. Connect with Stripe to start
                  accepting payments for your paid content.
                </p>
                <Button onClick={startOnboarding} disabled={acting} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  {acting ? 'Redirecting…' : 'Connect with Stripe'}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <StatusRow
                    ok={status.charges_enabled}
                    okLabel="Accepting payments"
                    pendingLabel="Payments not yet enabled"
                  />
                  <StatusRow
                    ok={status.payouts_enabled}
                    okLabel="Payouts to your bank enabled"
                    pendingLabel="Payouts not yet enabled"
                  />
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {status.charges_enabled ? (
                    <Button variant="outline" onClick={openDashboard} disabled={acting} className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Open Stripe dashboard
                    </Button>
                  ) : (
                    <Button onClick={startOnboarding} disabled={acting} className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      {acting ? 'Redirecting…' : 'Continue setup'}
                    </Button>
                  )}
                </div>
                {!status.charges_enabled && (
                  <p className="text-xs text-muted-foreground">
                    Stripe is still reviewing your details. This page updates automatically once
                    you&apos;re approved.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusRow({ ok, okLabel, pendingLabel }: { ok: boolean; okLabel: string; pendingLabel: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-marketing-accent" />
      ) : (
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{ok ? okLabel : pendingLabel}</span>
      <Badge variant={ok ? 'success' : 'secondary'} className="ml-auto">
        {ok ? 'Enabled' : 'Pending'}
      </Badge>
    </div>
  )
}

function UpgradeGate() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Upgrade to start selling</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Getting paid requires a paid plan with an active subscription. On the free plan everything
          you offer must be free — no payouts, paid content, or subscriptions.
        </p>
        <Button asChild className="gap-2">
          <Link href="/admin/billing">
            <Wallet className="h-4 w-4" />
            View plans
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
