import { Check, X } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { Parallax } from '@/components/landing/parallax'
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
    <div className="relative flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      {/* Hero */}
      <section className="hero-scroll-out relative isolate overflow-hidden px-6 pb-20 pt-28 md:pt-36">
        <Parallax speed={-0.18} className="absolute inset-0 -z-10">
          <div className="aurora animate-aurora" />
        </Parallax>
        <div className="grid-fade pointer-events-none absolute inset-0 -z-10 opacity-60" />

        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-in-up text-eyebrow text-muted-foreground/80">Pricing</p>
          <h1
            className="text-display mt-4 animate-fade-in-up text-5xl leading-[1.05] md:text-6xl lg:text-7xl"
            style={{ animationDelay: '0.1s' }}
          >
            <span className="text-foreground/95">{t('title')}</span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-xl animate-fade-in-up text-[17px] leading-relaxed text-muted-foreground md:text-lg"
            style={{ animationDelay: '0.22s' }}
          >
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {PLAN_KEYS.map((key, idx) => {
            const highlighted = PLAN_HIGHLIGHT[key]
            const includedSet = new Set(
              (t.raw(`plans.${key}.included`) as string[]) ?? [],
            )
            const planId = planIdByKey[key] ?? null
            return (
              <ScrollReveal
                key={key}
                variant="scale"
                fromScale={0.94}
                duration={1}
                delay={idx * 0.1}
              >
              <div
                className={`relative flex flex-col rounded-3xl p-8 transition-transform duration-300 hover:-translate-y-1 md:p-9 ${
                  highlighted ? 'glass-strong shadow-glow-blue' : 'glass-pane'
                }`}
              >
                {/* Aurora glow under highlighted plan */}
                {highlighted && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-8 -top-10 -z-10 h-40 rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] via-[oklch(0.55_0.24_270)] to-[oklch(0.7_0.2_210)] opacity-50 blur-3xl"
                  />
                )}

                <div className="flex items-baseline justify-between">
                  <p className="text-eyebrow text-muted-foreground/80">
                    {t(`plans.${key}.name`)}
                  </p>
                  {highlighted && (
                    <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-0.5 text-[10.5px] font-semibold tracking-[0.04em] text-primary">
                      {t('popular')}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-display text-5xl md:text-6xl">
                    {t(`plans.${key}.price`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`plans.${key}.period`)}
                  </span>
                </div>

                <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                  {t(`plans.${key}.description`)}
                </p>

                <div className="my-7 h-px bg-foreground/[0.08]" />

                <ul className="flex-1 space-y-3">
                  {PLAN_FEATURE_KEYS[key].map((featureKey) => {
                    const included = includedSet.has(featureKey)
                    return (
                      <li key={featureKey} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${
                            included
                              ? 'bg-primary/15 text-primary'
                              : 'bg-foreground/[0.06] text-muted-foreground/40'
                          }`}
                          style={{ height: '1.125rem', width: '1.125rem' }}
                        >
                          {included ? (
                            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                          ) : (
                            <X className="h-2.5 w-2.5" strokeWidth={3.5} />
                          )}
                        </span>
                        <span
                          className={`text-[13.5px] leading-relaxed ${
                            included ? 'text-foreground/90' : 'text-muted-foreground/60'
                          }`}
                        >
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
                  variant={highlighted ? 'brand' : 'outline'}
                  size="lg"
                  className="mt-8 w-full"
                />
              </div>
              </ScrollReveal>
            )
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-28">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal variant="blur" duration={1}>
            <div className="text-center">
              <p className="text-eyebrow text-muted-foreground/80">Questions</p>
              <h2 className="text-display mt-4 text-4xl md:text-5xl">{t('faq.title')}</h2>
            </div>
          </ScrollReveal>

          <div className="mt-16 space-y-12">
            {FAQ_KEYS.map((key, i) => (
              <ScrollReveal
                key={key}
                direction="up"
                duration={0.9}
                delay={i * 0.08}
              >
                <div>
                  <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-foreground">
                    {t(`faq.items.${key}.q`)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    {t(`faq.items.${key}.a`)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative isolate overflow-hidden px-6 py-32 md:py-40">
        <Parallax speed={-0.15} className="absolute inset-0 -z-10">
          <div className="aurora-soft" />
        </Parallax>

        <div className="mx-auto max-w-3xl">
          <ScrollReveal variant="zoom" duration={1.2}>
            <div className="glass-pane p-12 text-center md:p-16">
              <h2 className="text-display text-4xl md:text-5xl">{t('cta2.title')}</h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
                {t('cta2.subtitle')}
              </p>
              <Button asChild variant="brand" size="xl" className="mt-8">
                <Link href="/signup">{t('cta2.button')}</Link>
              </Button>
              <p className="mt-4 text-[13px] text-muted-foreground/80">
                {t('cta2.trustNote')}
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
