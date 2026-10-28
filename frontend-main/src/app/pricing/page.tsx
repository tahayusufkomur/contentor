import { Check, ChevronDown, Minus } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { formatPlanPrice } from "@shared/lib/format-plan-price";
import { getAuthUser } from "@/lib/auth";
import { fetchPlans } from "@/lib/plans-server";
import {
  FEATURE_KEYS,
  PLAN_KEYS,
  featureCell,
  includedFeatures,
  planKeyFromName,
  type Cell,
  type PlanKey,
  type PlanSummary,
} from "@/lib/pricing-matrix";

import { PricingCta } from "./PricingCta";

const FAQ_KEYS = ["switch", "trial", "payments", "limits"] as const;
const HIGHLIGHTED: PlanKey = "starter";
/** The compare grid: a label column on md+, then one column per plan. On a
 * phone the label spans the row above the two cells. */
const COLUMNS =
  "grid grid-cols-2 gap-3 md:grid-cols-[1.4fr_repeat(2,1fr)] md:gap-6";

/** One compare cell. The sr-only text names the plan (and, for a yes/no
 * cell, the feature) so a screen reader does not read a bare "Included". */
function CellView({
  cell,
  plan,
  included,
  notIncluded,
}: {
  cell: Cell;
  plan: string;
  included: string;
  notIncluded: string;
}) {
  if (cell.kind === "text") {
    return (
      <span className="text-caption text-foreground">
        <span className="sr-only">{plan}: </span>
        {cell.label}
      </span>
    );
  }
  if (cell.kind === "yes") {
    return (
      <>
        <Check
          aria-hidden
          className="size-4 text-foreground"
          strokeWidth={2.5}
        />
        <span className="sr-only">{included}</span>
      </>
    );
  }
  return (
    <>
      <Minus aria-hidden className="size-4 text-muted-foreground" />
      <span className="sr-only">{notIncluded}</span>
    </>
  );
}

// TODO(phase-2): under each pricing CTA, surface a "Already have an account?
// Manage your plan in your dashboard." link routing to
// `https://{slug}.contentor.app/admin/billing` when a `tenant_slug` cookie is
// present on the marketing apex. The marketing host can't read tenant-subdomain
// cookies, so this requires a dedicated cookie set at login time. Left out of
// Phase 1.5 to keep scope tight — `ChangePlanCard` on the tenant subdomain
// covers the existing-coach upgrade path for now.
export default async function PricingPage() {
  const locale = await getLocale();
  const user = await getAuthUser();
  const t = await getTranslations("pricing");
  const plansData = await fetchPlans();
  const planByKey: Partial<Record<PlanKey, PlanSummary>> = {};
  for (const p of plansData?.plans ?? []) {
    const key = planKeyFromName(p.name);
    if (key != null) planByKey[key] = p;
  }
  const included = Object.fromEntries(
    PLAN_KEYS.map((key) => [
      key,
      includedFeatures(
        (t.raw(`plans.${key}.included`) as string[]) ?? [],
        planByKey[key] ?? null,
      ),
    ]),
  ) as Record<PlanKey, Set<string>>;
  // Price from the backend when the plan resolved; the locale fallback keeps
  // the page rendering if the API is unavailable. null = a plan with no price
  // in this currency yet (shown as "coming soon", not "€0").
  const price = (key: PlanKey): string | null => {
    const plan = planByKey[key];
    if (!plan) return t(`plans.${key}.price`);
    return plan.amount_cents == null
      ? null
      : formatPlanPrice(plan.currency, plan.amount_cents, locale);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 pb-16 pt-24 md:pb-24 md:pt-32">
          <div className="mx-auto max-w-text text-center">
            <p className="text-eyebrow text-muted-foreground">Pricing</p>
            <h1 className="mt-4 text-display text-balance text-foreground">
              {t("title")}
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-body-lg text-balance text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </section>

        {/* Compare */}
        <section className="bg-muted">
          <div className="mx-auto max-w-text px-6 pb-20 pt-6 md:pb-28">
            {/* Plan header: the one sticky element on this page, so it sits
              directly under the 48 px header. Opaque second paper hides the
              rows scrolling beneath it. */}
            <div
              className={`sticky top-12 z-30 -mx-6 border-b bg-muted px-6 py-4 ${COLUMNS}`}
            >
              <div className="hidden md:block" aria-hidden />
              {PLAN_KEYS.map((key) => {
                const amount = price(key);
                return (
                  <div key={key} className="min-w-0">
                    {/* The badge takes its own line on phones instead of
                      truncating beside the plan name. */}
                    <p className="text-eyebrow text-muted-foreground">
                      {t(`plans.${key}.name`)}
                      {key === HIGHLIGHTED && (
                        <span className="block text-marketing-accent md:ml-2 md:inline">
                          {t("popular")}
                        </span>
                      )}
                    </p>
                    {amount == null ? (
                      <p className="mt-1 text-caption text-muted-foreground">
                        {t("comingSoon")}
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 truncate text-title-2 text-foreground md:text-title">
                          {amount}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {t(`plans.${key}.period`)}
                        </p>
                        {key === "starter" && (
                          <p className="text-caption font-medium text-marketing-accent">
                            {t("plans.starter.trial")}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Description and CTA: scroll away with the page */}
            <div className={`${COLUMNS} mt-6`}>
              <div className="hidden md:block" aria-hidden />
              {PLAN_KEYS.map((key) => (
                <div key={key} className="flex min-w-0 flex-col">
                  <p className="hidden flex-1 text-caption text-muted-foreground md:block">
                    {t(`plans.${key}.description`)}
                  </p>
                  <PricingCta
                    planId={planByKey[key]?.id ?? null}
                    terms={
                      planByKey[key]
                        ? {
                            ...planByKey[key],
                            // Starter opens with monetization.trial_days_for's 14 days.
                            trial_days: key === "starter" ? 14 : 0,
                          }
                        : null
                    }
                    isAuthenticated={user != null}
                    label={key === "starter" ? t("trialCta") : undefined}
                    variant={key === HIGHLIGHTED ? "brand" : "outline"}
                    size="lg"
                    className="w-full rounded-full md:mt-5"
                  />
                </div>
              ))}
            </div>

            {/* Feature table */}
            <div className="mt-10 border-t">
              {FEATURE_KEYS.map((feature) => (
                <div
                  key={feature}
                  className={`${COLUMNS} items-center border-b py-4`}
                >
                  <p className="col-span-2 text-caption font-medium text-foreground md:col-span-1">
                    {t(`features.${feature}`)}
                  </p>
                  {PLAN_KEYS.map((key) => (
                    <div key={key} className="flex min-w-0 items-center">
                      <CellView
                        cell={featureCell(
                          feature,
                          included[key],
                          planByKey[key] ?? null,
                          () => t(`plans.${key}.features.${feature}`),
                          locale,
                        )}
                        plan={t(`plans.${key}.name`)}
                        included={t("compare.included", {
                          plan: t(`plans.${key}.name`),
                          feature: t(`features.${feature}`),
                        })}
                        notIncluded={t("compare.notIncluded", {
                          plan: t(`plans.${key}.name`),
                          feature: t(`features.${feature}`),
                        })}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-6 py-20 md:py-28">
          <div className="mx-auto max-w-[760px]">
            <div className="text-center">
              <p className="text-eyebrow text-muted-foreground">Questions</p>
              <h2 className="mt-4 text-title text-foreground">
                {t("faq.title")}
              </h2>
            </div>
            <div className="mt-12 border-t">
              {FAQ_KEYS.map((key) => (
                <details key={key} className="group border-b py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-body font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {t(`faq.items.${key}.q`)}
                    <ChevronDown
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-expo"
                    />
                  </summary>
                  <p className="mt-3 max-w-[640px] text-body text-muted-foreground">
                    {t(`faq.items.${key}.a`)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-muted px-6 py-20 md:py-28">
          <div className="mx-auto max-w-text text-center">
            <h2 className="text-title text-foreground">{t("cta2.title")}</h2>
            <p className="mx-auto mt-4 max-w-[560px] text-body text-muted-foreground">
              {t("cta2.subtitle")}
            </p>
            <Button
              asChild
              variant="brand"
              size="xl"
              className="mt-8 rounded-full"
            >
              <NavLink href="/signup">{t("cta2.button")}</NavLink>
            </Button>
            <p className="mt-4 text-caption text-muted-foreground">
              {t("cta2.trustNote")}
            </p>
          </div>
        </section>
      </main>

      <PlatformFooter flush />
    </div>
  );
}
