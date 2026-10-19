"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  EmbeddedCheckoutOverlay,
  PlanCheckoutAside,
  type CheckoutStart,
  type PlanTerms,
} from "@shared/checkout/embedded-checkout";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button, type ButtonProps } from "@/components/ui/button";
import { startCheckout } from "@/lib/api/billing-platform";
import { ApiError } from "@/types/api";

interface PricingCtaProps {
  planId: number | null;
  /** What the checkout panel says the plan costs and when. */
  terms: PlanTerms | null;
  /** True when the marketing user is logged in. Unauthenticated users get routed to /signup. */
  isAuthenticated: boolean;
  /** The button's words; "Get Started" when unset. */
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * Pricing-card CTA. Three behaviors:
 *  - Anonymous: route to /signup so onboarding kicks in (the Starter trial
 *    starts when the site goes live).
 *  - Authenticated coach on a paid plan: hit /api/v1/billing/platform/checkout/
 *    and open its embedded checkout (Stripe's hosted page when the server
 *    has no publishable key).
 *  - On API error: show an inline error string; the surrounding card stays.
 */
export function PricingCta({
  planId,
  terms,
  isAuthenticated,
  label,
  variant = "default",
  size,
  className,
}: PricingCtaProps) {
  const t = useTranslations("pricing");
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<
    (CheckoutStart & { client_secret: string }) | null
  >(null);

  const { run: handleClick, loading } = useAsyncAction(
    async () => {
      setError(null);
      if (!isAuthenticated || planId == null) {
        navigate("/signup");
        return;
      }
      const res = await startCheckout(planId);
      if (res.client_secret)
        setSession({ ...res, client_secret: res.client_secret });
      else window.location.assign(res.checkout_url ?? "");
    },
    {
      onError: (err) => {
        if (
          err instanceof ApiError &&
          (err.data?.error as string | undefined) === "PRICE_NOT_AVAILABLE"
        ) {
          setError(t("errors.priceNotAvailable"));
        } else {
          setError(t("errors.generic"));
        }
      },
    },
  );

  return (
    <>
      <Button
        type="button"
        onClick={handleClick}
        loading={loading}
        loadingText={t("ctaProcessing")}
        variant={variant}
        size={size}
        className={className}
      >
        {label ?? t("cta")}
      </Button>
      {error != null && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
      {session && terms && (
        <EmbeddedCheckoutOverlay
          session={session}
          onClose={() => setSession(null)}
          aside={
            <PlanCheckoutAside
              title="Everything you teach, in one place"
              plan={terms}
            />
          }
        />
      )}
    </>
  );
}
