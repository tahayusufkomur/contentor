'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getSubscription,
  listPlatformPlans,
  startCheckout,
  type PlatformPlanSummary,
  type PlatformSubscriptionState,
} from '@/lib/api/billing-platform'

interface Props {
  /** Optional region override, primarily for tests. Production callers omit
   *  this — the component derives currency from `subscription.currency`
   *  first, then host. */
  regionHint?: 'global' | 'tr'
}

type CurrencyCode = 'USD' | 'TRY'

/** Derive the host-based region. Mirrors `frontend-customer/src/i18n/config.ts`
 *  but kept inline here because that module is server-only (`headers()`). */
function regionFromHost(host: string): 'global' | 'tr' {
  const h = (host || '').split(':')[0].toLowerCase()
  if (/\.tr\.contentor\.(app|localhost)$/i.test(h)) return 'tr'
  return 'global'
}

function currencyForRegion(region: 'global' | 'tr'): CurrencyCode {
  return region === 'tr' ? 'TRY' : 'USD'
}

function formatPrice(amountCents: number | null, currency: CurrencyCode): string {
  if (amountCents == null) return '—'
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat(currency === 'TRY' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/** Sort: Free first, then by USD amount ascending (Starter before Pro). */
function sortPlans(plans: PlatformPlanSummary[]): PlatformPlanSummary[] {
  return [...plans].sort((a, b) => {
    if (a.is_free && !b.is_free) return -1
    if (!a.is_free && b.is_free) return 1
    const av = a.prices?.USD?.amount_cents ?? a.amount_cents ?? 0
    const bv = b.prices?.USD?.amount_cents ?? b.amount_cents ?? 0
    return av - bv
  })
}

/**
 * In-tenant upgrade UI. Renders one card per non-Free plan and either:
 *   - marks it as the user's current plan (disabled button + badge),
 *   - offers an "Upgrade to {plan}" button that starts a Stripe Checkout
 *     session and redirects on success,
 *   - shows a "Coming soon in {currency}" notice if no Stripe price ID is
 *     configured for that currency yet.
 *
 * Downgrade UX is intentionally minimal for M1 — we show "Contact support to
 * downgrade" rather than a full self-serve downgrade flow. The spec defers
 * downgrades; bundling it here would balloon scope.
 */
export function ChangePlanCard({ regionHint }: Props) {
  const t = useTranslations('admin.subscription.changePlan')
  const tRoot = useTranslations('admin.subscription')
  const [subscription, setSubscription] = useState<PlatformSubscriptionState | null>(null)
  const [plans, setPlans] = useState<PlatformPlanSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [subRes, plansRes] = await Promise.all([getSubscription(), listPlatformPlans()])
        if (cancelled) return
        setSubscription(subRes)
        setPlans(plansRes.plans)
      } catch {
        if (!cancelled) setLoadError(tRoot('error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [tRoot])

  const currency: CurrencyCode = useMemo(() => {
    // Prefer the tenant's locked billing_currency if present on the
    // subscription state. Else derive from host (or override).
    const fromSub = subscription?.currency
    if (fromSub === 'USD' || fromSub === 'TRY') return fromSub
    const region =
      regionHint ?? (typeof window !== 'undefined' ? regionFromHost(window.location.host) : 'global')
    return currencyForRegion(region)
  }, [regionHint, subscription?.currency])

  const sortedPlans = useMemo(() => (plans ? sortPlans(plans) : []), [plans])
  const currentPlanId = subscription?.plan?.id ?? null
  const currentPlanIndex = useMemo(() => {
    if (currentPlanId == null) return -1
    return sortedPlans.findIndex((p) => p.id === currentPlanId)
  }, [sortedPlans, currentPlanId])

  async function handleUpgrade(plan: PlatformPlanSummary) {
    setActionError(null)
    setPendingPlanId(plan.id)
    try {
      const res = await startCheckout(plan.id)
      window.location.href = res.checkout_url
    } catch {
      setActionError(t('error'))
      setPendingPlanId(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{loadError}</p>
        </CardContent>
      </Card>
    )
  }

  // Non-Free plans only — Free is the implicit baseline and is shown by the
  // SubscriptionTile above.
  const paidPlans = sortedPlans.filter((p) => !p.is_free)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {actionError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {paidPlans.map((plan) => {
            const isCurrent = plan.id === currentPlanId
            const planIndex = sortedPlans.findIndex((p) => p.id === plan.id)
            const isDowngrade = currentPlanIndex >= 0 && planIndex < currentPlanIndex
            const priceEntry = plan.prices?.[currency]
            const available = Boolean(priceEntry?.available)
            const isPending = pendingPlanId === plan.id
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : undefined}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="capitalize">{plan.name}</span>
                    {isCurrent && <Badge variant="brand">{t('currentPlan')}</Badge>}
                  </CardTitle>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {formatPrice(priceEntry?.amount_cents ?? null, currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Separator />
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{t('limits.students', { n: plan.max_students })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{t('limits.storage', { n: plan.max_storage_gb })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{t('limits.streamingHours', { n: plan.max_streaming_hours })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{t('limits.campaignEmails', { n: plan.max_campaign_emails })}</span>
                    </li>
                  </ul>
                  {!available && !isCurrent && (
                    <p className="text-xs text-muted-foreground">
                      {t('comingSoonInCurrency', { currency })}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={() => handleUpgrade(plan)}
                    disabled={isCurrent || isDowngrade || !available || isPending}
                    variant={isCurrent ? 'outline' : 'default'}
                    className="w-full"
                  >
                    {isCurrent
                      ? t('currentPlan')
                      : isDowngrade
                        ? t('downgrade')
                        : isPending
                          ? t('processing')
                          : t('upgradeTo', { plan: plan.name })}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
