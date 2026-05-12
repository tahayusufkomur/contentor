'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { startCheckout } from '@/lib/api/billing-platform'
import { ApiError } from '@/types/api'

interface PricingCtaProps {
  planId: number | null
  /** Free plans don't checkout — they route to /signup instead. */
  isFreePlan: boolean
  /** True when the marketing user is logged in. Unauthenticated users get routed to /signup. */
  isAuthenticated: boolean
  variant?: 'default' | 'outline'
}

/**
 * Pricing-card CTA. Three behaviors:
 *  - Anonymous or Free plan: route to /signup so onboarding kicks in.
 *  - Authenticated coach on a paid plan: hit /api/v1/billing/platform/checkout/
 *    and redirect to the Stripe-hosted URL.
 *  - On API error: show an inline error string; the surrounding card stays.
 */
export function PricingCta({ planId, isFreePlan, isAuthenticated, variant = 'default' }: PricingCtaProps) {
  const t = useTranslations('pricing')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    if (!isAuthenticated || isFreePlan || planId == null) {
      router.push('/signup')
      return
    }
    setLoading(true)
    try {
      const res = await startCheckout(planId)
      window.location.assign(res.checkout_url)
    } catch (err) {
      if (err instanceof ApiError && (err.data?.error as string | undefined) === 'PRICE_NOT_AVAILABLE') {
        setError(t('errors.priceNotAvailable'))
      } else {
        setError(t('errors.generic'))
      }
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 w-full">
      <Button
        type="button"
        onClick={handleClick}
        disabled={loading}
        variant={variant}
        className="w-full"
      >
        {loading ? t('ctaProcessing') : t('cta')}
      </Button>
      {error != null && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
