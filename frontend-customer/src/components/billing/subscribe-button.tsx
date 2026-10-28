"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { formatMoney } from "@/lib/format";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import {
  EmbeddedCheckoutOverlay,
  type CheckoutStart,
} from "@shared/checkout/embedded-checkout";
import { StudentCheckoutAside } from "@/components/billing/checkout-panels";
import { useLocale, useTranslations } from "next-intl";

interface SubscribeButtonProps {
  planId: number;
  planName: string;
  price: string;
  currency: string;
  intervalMonths?: number;
  className?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  /** Replaces the default "Subscribe — price" text (and its icon). */
  label?: React.ReactNode;
}

export function SubscribeButton({
  planId,
  planName,
  price,
  currency,
  intervalMonths,
  className,
  variant = "default",
  size = "default",
  label,
}: SubscribeButtonProps) {
  const locale = useLocale();
  const tSite = useTranslations("site");
  const router = useRouter();
  const navigate = useNavigate();
  const [session, setSession] = useState<
    (CheckoutStart & { client_secret: string }) | null
  >(null);

  // "$9" plus its cycle ("/mo"): the suffix is the shared one, per language.
  const priceLabel =
    formatMoney(price, currency, locale) +
    billingIntervalSuffix(intervalMonths, (k, v) => tSite(`plan.${k}`, v));

  const { run: handleSubscribe, loading } = useAsyncAction(
    async () => {
      const res = await clientFetch<CheckoutStart>(
        "/api/v1/billing/subscribe/",
        { method: "POST", body: JSON.stringify({ plan_id: planId }) },
      );
      // Real Stripe checkout (mode=subscription): embedded here, or Stripe's
      // hosted page.
      if (res?.client_secret) {
        setSession({ ...res, client_secret: res.client_secret });
        return;
      }
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      // Bypass: subscription is active immediately.
      toast.success(tSite("plan.subscribedTo", { plan: planName }));
      router.refresh();
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          navigate(
            `/login?toast=${encodeURIComponent(tSite("plan.loginToSubscribe"))}&toast_type=info`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          toast.info(tSite("store.alreadySubscribed"));
          return;
        }
        toast.error(
          err instanceof Error ? err.message : tSite("plan.subscriptionFailed"),
        );
      },
    },
  );

  return (
    <>
      {session && (
        <EmbeddedCheckoutOverlay
          session={session}
          onClose={() => setSession(null)}
          aside={
            <StudentCheckoutAside
              title={planName}
              steps={[
                {
                  when: tSite("checkout.now"),
                  what: tSite("checkout.paySecurely", { amount: priceLabel }),
                },
                {
                  when: tSite("checkout.rightAfter"),
                  what: tSite("checkout.opensInPlan", { plan: planName }),
                },
                {
                  when: tSite("checkout.anyTime"),
                  what: tSite("checkout.cancelAnyTime"),
                },
              ]}
            />
          }
        />
      )}
      <Button
        className={className}
        variant={variant}
        size={size}
        loading={loading}
        onClick={handleSubscribe}
      >
        {label ?? (
          <>
            <Zap className="mr-2 h-4 w-4" />
            {tSite("plan.subscribeFor", { price: priceLabel })}
          </>
        )}
      </Button>
    </>
  );
}
