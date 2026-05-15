import { Check, X } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'
import { getAuthUser } from '@/lib/auth'
import { BASE_DOMAIN, DJANGO_API_URL } from '@/lib/constants'

import { PricingCta } from './PricingCta'

const PLAN_KEYS = ['free', 'starter', 'pro'] as const
type PlanKey = (typeof PLAN_KEYS)[number]
const FAQ_KEYS = ['switch', 'trial', 'payments', 'limits'] as const

const PLAN_FEATURE_KEYS: Record<PlanKey, readonly string[]> = {
  free: ['students', 'storage', 'courseBuilder', 'support', 'fee', 'live', 'branding', 'domain'],
  starter: ['students', 'storage', 'courseBuilder', 'live', 'branding', 'campaigns', 'fee', 'domain'],
  pro: ['students', 'storage', 'courseBuilder', 'live', 'domain', 'campaigns', 'fee', 'support'],
}

const PLAN_HIGHLIGHT: Record<PlanKey, boolean> = {
  free: false,
  starter: true,
  pro: false,
}

// Maps server-side PlatformPlan.name (lowercased) to a PLAN_KEY. The seed
// command writes "Free", "starter", "pro" — keep both casings tolerated.
function planKeyFromName(name: string): PlanKey | null {
  const lower = name.toLowerCase()
  if (lower === 'free') return 'free'
  if (lower === 'starter') return 'starter'
  if (lower === 'pro') return 'pro'
  return null
}

interface PlanSummary {
  id: number
  name: string
  is_free: boolean
  currency: string
  amount_cents: number | null
}

interface PlansResponse {
  region: string
  currency: string
  plans: PlanSummary[]
}

async function fetchPlans(): Promise<PlansResponse | null> {
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/billing/platform/plans/`, {
      headers: { 'X-Tenant-Domain': BASE_DOMAIN },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// TODO(phase-2): under each pricing CTA, surface a "Already have an account?
// Manage your plan in your dashboard." link routing to
// `https://{slug}.contentor.app/admin/billing` when a `tenant_slug` cookie is
// present on the marketing apex. The marketing host can't read tenant-subdomain
// cookies, so this requires a dedicated cookie set at login time. Left out of
// Phase 1.5 to keep scope tight — `ChangePlanCard` on the tenant subdomain
// covers the existing-coach upgrade path for now.
export default async function PricingPage() {
  const user = await getAuthUser()
  const t = await getTranslations('pricing')
  const plansData = await fetchPlans()
  const planIdByKey: Partial<Record<PlanKey, number>> = {}
  for (const p of plansData?.plans ?? []) {
    const key = planKeyFromName(p.name)
    if (key != null) planIdByKey[key] = p.id
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <section className="px-6 pb-16 pt-32 md:pt-40">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {PLAN_KEYS.map((key) => {
            const highlighted = PLAN_HIGHLIGHT[key]
            const includedSet = new Set(
              (t.raw(`plans.${key}.included`) as string[]) ?? [],
            )
            const planId = planIdByKey[key] ?? null
            return (
              <Card
                key={key}
                className={highlighted ? 'relative ring-2 ring-primary' : 'border'}
              >
                {highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>{t('popular')}</Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">{t(`plans.${key}.name`)}</CardTitle>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold tracking-tight text-foreground">
                      {t(`plans.${key}.price`)}
                    </span>
                    <span className="text-sm text-muted-foreground">{t(`plans.${key}.period`)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{t(`plans.${key}.description`)}</p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <Separator className="mb-6" />
                  <ul className="flex-1 space-y-3">
                    {PLAN_FEATURE_KEYS[key].map((featureKey) => {
                      const included = includedSet.has(featureKey)
                      return (
                        <li key={featureKey} className="flex items-start gap-3 text-sm">
                          {included ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                          ) : (
                            <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                          )}
                          <span className={included ? 'text-foreground' : 'text-muted-foreground/60'}>
                            {t(`plans.${key}.features.${featureKey}`)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <PricingCta
                    planId={planId}
                    isFreePlan={key === 'free'}
                    isAuthenticated={user != null}
                    variant={highlighted ? 'default' : 'outline'}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="border-t px-6 py-32 md:py-40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t('faq.title')}
          </h2>
          <div className="mt-16 space-y-12">
            {FAQ_KEYS.map((key) => (
              <div key={key}>
                <h3 className="font-display text-base font-semibold text-foreground">
                  {t(`faq.items.${key}.q`)}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`faq.items.${key}.a`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t px-6 py-32 md:py-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t('cta2.title')}
          </h2>
          <p className="mt-4 text-muted-foreground">{t('cta2.subtitle')}</p>
          <p className="mt-3 text-sm text-muted-foreground/60">{t('cta2.trustNote')}</p>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
