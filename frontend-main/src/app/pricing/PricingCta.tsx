"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button, type ButtonProps } from "@/components/ui/button";
import { startCheckout } from "@/lib/api/billing-platform";
import { ApiError } from "@/types/api";

interface PricingCtaProps {
  planId: number | null;
  /** Free plans don't checkout — they route to /signup instead. */
  isFreePlan: boolean;
  /** True when the marketing user is logged in. Unauthenticated users get routed to /signup. */
  isAuthenticated: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * Pricing-card CTA. Three behaviors:
 *  - Anonymous or Free plan: route to /signup so onboarding kicks in.
 *  - Authenticated coach on a paid plan: hit /api/v1/billing/platform/checkout/
 *    and redirect to the Stripe-hosted URL.
 *  - On API error: show an inline error string; the surrounding card stays.
 */
export function PricingCta({
  planId,
  isFreePlan,
  isAuthenticated,
  variant = "default",
  size,
  className,
}: PricingCtaProps) {
  const t = useTranslations("pricing");
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const { run: handleClick, loading } = useAsyncAction(
    async () => {
      setError(null);
      if (!isAuthenticated || isFreePlan || planId == null) {
        navigate("/signup");
        return;
      }
      const res = await startCheckout(planId);
      window.location.assign(res.checkout_url);
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
        {t("cta")}
      </Button>
      {error != null && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </>
  );
}
