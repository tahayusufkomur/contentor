"use client";

// The launch chapter's domain step: offer a custom domain without leaving
// onboarding. Phases —
//   resolving -> read return params + answers + paid state to pick a phase
//   locked    -> paid-plan cards (same door idiom as ai-logo.tsx's AI door);
//                choosing one runs the plan checkout round-trip and returns
//                HERE (current_step stays "domain", so LogoStep never mounts)
//   search    -> availability search on the wizard token, seeded from brand
//   contact   -> ICANN registrant details (RegistrantForm, localized labels)
//   syncing   -> return-from-checkout probe: a domain purchase (session_id or
//                the dev bypass's custom_domain_id) or a plan upgrade
//                (upgraded=1&session_id) — activated server-side, no webhook
//   done      -> purchased panel; Continue commits the answer and advances
// The skip links are always available before purchase: "skipped" and "later"
// both keep the free subdomain (distinct values feed dashboard nudges), so a
// coach is never trapped behind payment. Purchase NEVER blocks finalize —
// registration/DNS/SSL run in Celery long after the wizard closes.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Globe2, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { RegistrantForm } from "@/components/domain/registrant-form";
import { listPlans, type PlanSummary } from "@/lib/api/billing-platform";
import {
  formatPrice,
  type DomainResult,
  type RegistrantContact,
} from "@/lib/domains";
import { patchWizardState, readWizardState } from "@/lib/wizard/api";
import {
  wizardDomainCheckout,
  wizardDomainSearch,
  wizardDomainSync,
} from "@/lib/wizard/domain-api";
import { wizardCheckout, wizardCheckoutSync } from "@/lib/wizard/logo-api";
import type { WizardAnswers } from "@/lib/wizard/types";
import { ApiError } from "@/types/api";

import { OptionCard, OptionList, SlideHeader } from "./steps";

type Phase = "resolving" | "locked" | "search" | "contact" | "syncing" | "done";

/** "Pay Studio" -> "paystudio" — the seed the search box starts from; the
 * server's _normalize_query appends ".com" to a TLD-less query. */
function seedFromBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 63);
}

/** The coach's email + name from the wizard token payload (same decode idiom
 * as WizardFlow's brandFromToken) — prefills the registrant form. */
function identityFromToken(token: string): { email: string; name: string } {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return {
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return { email: "", name: "" };
  }
}

export function DomainStep({
  token,
  brand,
  value,
  onDone,
  disabled,
}: {
  token: string;
  brand: string;
  value?: WizardAnswers["custom_domain"];
  onDone: (patch: Partial<WizardAnswers>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("wizard");
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("resolving");
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<number | null>(null);
  const [q, setQ] = useState(seedFromBrand(brand));
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [suggestions, setSuggestions] = useState<DomainResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<DomainResult | null>(null);
  const [paying, setPaying] = useState(false);
  const [ownedDomain, setOwnedDomain] = useState<string>(value?.domain ?? "");
  const resolvedRef = useRef(false);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSearching(true);
      setError(null);
      try {
        const res = await wizardDomainSearch(token, trimmed);
        setResults(res.results);
        setSuggestions(res.suggestions);
        setSearched(true);
      } catch {
        setError(t("domain.searchFailed"));
      } finally {
        setSearching(false);
      }
    },
    [token, t],
  );

  const enterSearch = useCallback(
    (seed: string) => {
      setPhase("search");
      // The seeded first search is the magic moment — only fire it once;
      // coming back from the contact form keeps the existing results.
      if (seed) void runSearch(seed);
    },
    [runSearch],
  );

  const enterLocked = useCallback(() => {
    setPhase("locked");
    listPlans()
      .then((res) => setPlans(res.plans.filter((p) => !p.is_free)))
      .catch(() => setError(t("common.errors.generic")));
  }, [t]);

  // ── resolving: return params + answers + paid state pick the phase ──────
  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const sessionId = params.get("session_id");
    const upgraded = params.get("upgraded") === "1";
    const bypassId = params.get("bypass") === "1" && params.get("custom_domain_id");
    const canceled = params.get("domain_canceled") === "1";

    const finishDomainSync = (res: {
      custom_domain: { domain: string; provisioning_status: string } | null;
    }) => {
      const cd = res.custom_domain;
      if (cd && cd.provisioning_status !== "lapsed") {
        setOwnedDomain(cd.domain);
        setPhase("done");
      } else {
        setError(t("domain.syncFailed"));
        enterSearch(seedFromBrand(brand));
      }
    };

    if (value?.choice === "purchased") {
      setPhase("done");
      return;
    }
    if (bypassId) {
      setPhase("syncing");
      wizardDomainSync(token, { custom_domain_id: Number(bypassId) })
        .then(finishDomainSync)
        .catch(() => {
          setError(t("domain.syncFailed"));
          enterSearch(seedFromBrand(brand));
        });
      return;
    }
    if (sessionId && !upgraded) {
      setPhase("syncing");
      wizardDomainSync(token, { session_id: sessionId })
        .then(finishDomainSync)
        .catch(() => {
          setError(t("domain.syncFailed"));
          enterSearch(seedFromBrand(brand));
        });
      return;
    }
    if (sessionId && upgraded) {
      // Plan upgrade launched FROM this step: sync it, then unlock search.
      setPhase("syncing");
      wizardCheckoutSync(token, sessionId)
        .then((res) => {
          if (res.has_paid_platform_plan) enterSearch(seedFromBrand(brand));
          else {
            setError(t("upgrade.syncSlow"));
            enterLocked();
          }
        })
        .catch(() => {
          setError(t("upgrade.syncSlow"));
          enterLocked();
        });
      return;
    }
    readWizardState(token)
      .then((res) => {
        if (canceled) setError(t("domain.canceled"));
        if (res.has_paid_platform_plan) enterSearch(seedFromBrand(brand));
        else enterLocked();
      })
      .catch(() => {
        setError(t("common.errors.generic"));
        enterLocked();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── locked: plan checkout round-trip (returns to this step) ─────────────
  const startPlanCheckout = async (plan: PlanSummary) => {
    if (checkoutBusyId) return;
    setCheckoutBusyId(plan.id);
    setError(null);
    try {
      await patchWizardState(token, { current_step: "domain" });
      const res = await wizardCheckout(token, plan.id);
      window.location.assign(res.checkout_url);
    } catch {
      setError(t("common.errors.generic"));
      setCheckoutBusyId(null);
    }
  };

  // ── contact -> Stripe (or dev bypass) ───────────────────────────────────
  const startDomainCheckout = async (contact: RegistrantContact) => {
    if (!picked || paying) return;
    setPaying(true);
    setError(null);
    try {
      await patchWizardState(token, { current_step: "domain" });
      const res = await wizardDomainCheckout(token, {
        domain: picked.domain,
        contact,
      });
      window.location.assign(res.checkout_url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // A purchase already exists (double-click, second tab) — resync.
        const res = await wizardDomainSync(token).catch(() => null);
        if (res?.custom_domain) {
          setOwnedDomain(res.custom_domain.domain);
          setPhase("done");
          setPaying(false);
          return;
        }
      }
      setError(
        err instanceof ApiError && err.status === 403
          ? t("domain.lockedTitle")
          : t("domain.checkoutFailed"),
      );
      setPaying(false);
    }
  };

  const skipLinks = (
    <div className="mt-6 flex items-center justify-center gap-6">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDone({ custom_domain: { choice: "skipped" } })}
        className="text-[13px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        {t("domain.keepFree")}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDone({ custom_domain: { choice: "later" } })}
        className="text-[13px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        {t("domain.later")}
      </button>
    </div>
  );

  if (phase === "resolving" || phase === "syncing") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Spinner />
        {phase === "syncing" && (
          <p className="text-[13px] text-muted-foreground">
            {t("domain.syncing")}
          </p>
        )}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-[440px] text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-display mt-4 text-[24px] leading-tight tracking-[-0.02em]">
          {ownedDomain
            ? t("domain.doneTitle", { domain: ownedDomain })
            : t("domain.doneTitleNoName")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {t("domain.doneBody")}
        </p>
        <Button
          type="button"
          variant="brand"
          size="lg"
          className="mt-6 w-full max-w-[340px]"
          disabled={disabled}
          onClick={() =>
            onDone({
              custom_domain: {
                choice: "purchased",
                ...(ownedDomain ? { domain: ownedDomain } : {}),
              },
            })
          }
        >
          {t("common.continue")}
        </Button>
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="mx-auto max-w-[440px]">
        <SlideHeader
          heading={t("domain.heading")}
          subhead={t("domain.lockedBody")}
        />
        <div className="mt-6 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Globe2 className="h-3.5 w-3.5 text-primary" />
            {t("domain.lockedTitle")}
          </p>
          {error && (
            <p className="mt-2 text-[12px] text-destructive">{error}</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {plans.length === 0 && !error ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : (
              plans.map((plan) => (
                <OptionCard
                  key={plan.id}
                  selected={false}
                  onSelect={() => startPlanCheckout(plan)}
                  title={plan.name}
                  subtitle={`${formatPrice(plan.amount_cents ?? 0, plan.currency)}/mo — ${t("upgrade.cta")}`}
                  badge={checkoutBusyId === plan.id ? "…" : undefined}
                  disabled={disabled || checkoutBusyId !== null}
                />
              ))
            )}
          </div>
        </div>
        {skipLinks}
      </div>
    );
  }

  if (phase === "contact" && picked) {
    return (
      <div className="mx-auto max-w-[440px]">
        <SlideHeader
          heading={t("domain.registrantHeading")}
          subhead={t("domain.registrantIntro", {
            domain: picked.domain,
            price: formatPrice(picked.price_minor, picked.currency),
          })}
        />
        <div className="mt-6 text-left">
          <RegistrantForm
            defaultEmail={identityFromToken(token).email}
            defaultName={identityFromToken(token).name}
            submitLabel={t("domain.payCta")}
            onBack={() => setPhase("search")}
            onSubmit={(c) => void startDomainCheckout(c)}
            labels={{
              intro: t("domain.form.intro"),
              firstName: t("domain.form.firstName"),
              lastName: t("domain.form.lastName"),
              company: t("domain.form.company"),
              address: t("domain.form.address"),
              city: t("domain.form.city"),
              state: t("domain.form.state"),
              zip: t("domain.form.zip"),
              country: t("domain.form.country"),
              phone: t("domain.form.phone"),
              email: t("domain.form.email"),
              back: t("common.back"),
              fillRequired: t("domain.form.fillRequired"),
              invalidPhone: t("domain.form.invalidPhone"),
            }}
          />
        </div>
        {error && (
          <p className="mt-3 text-center text-[13px] text-destructive">
            {error}
          </p>
        )}
        {paying && (
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Spinner size="sm" /> {t("domain.redirecting")}
          </p>
        )}
      </div>
    );
  }

  // ── search ────────────────────────────────────────────────────────────────
  const rows = (list: DomainResult[]) => (
    <OptionList className="flex flex-col gap-2">
      {list.map((r) => (
        <OptionCard
          key={r.domain}
          selected={false}
          onSelect={() => {
            if (r.available) {
              setPicked(r);
              setPhase("contact");
            }
          }}
          title={r.domain}
          subtitle={
            r.available
              ? t("domain.perYear", {
                  price: formatPrice(r.price_minor, r.currency),
                })
              : t("domain.taken")
          }
          disabled={disabled || !r.available}
        />
      ))}
    </OptionList>
  );

  return (
    <div className="mx-auto max-w-[440px]">
      <SlideHeader heading={t("domain.heading")} subhead={t("domain.subhead")} />
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(q);
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("domain.searchPlaceholder")}
          aria-label={t("domain.searchLabel")}
        />
        <Button type="submit" variant="brand" loading={searching}>
          <Search className="h-4 w-4" />
          {t("domain.searchCta")}
        </Button>
      </form>
      {error && (
        <p className="mt-3 text-center text-[13px] text-destructive">{error}</p>
      )}
      <div className="mt-4 space-y-2">
        {searching && !searched ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : (
          searched && (
            <>
              {rows(results)}
              {suggestions.length > 0 && (
                <>
                  <p className="pt-2 text-xs font-medium text-muted-foreground">
                    {t("domain.suggestions")}
                  </p>
                  {rows(suggestions)}
                </>
              )}
            </>
          )
        )}
      </div>
      {skipLinks}
    </div>
  );
}
