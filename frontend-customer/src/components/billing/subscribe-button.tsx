"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

interface SubscribeButtonProps {
  planId: number;
  planName: string;
  price: string;
  currency: string;
  intervalMonths?: number;
  className?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
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
}: SubscribeButtonProps) {
  const router = useRouter();
  const navigate = useNavigate();

  const { run: handleSubscribe, loading } = useAsyncAction(
    async () => {
      const res = await clientFetch<{ checkout_url?: string }>(
        "/api/v1/billing/subscribe/",
        { method: "POST", body: JSON.stringify({ plan_id: planId }) },
      );
      // Real Stripe checkout (mode=subscription): redirect to the hosted page.
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      // Bypass: subscription is active immediately.
      toast.success(`Subscribed to ${planName}!`);
      router.refresh();
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          navigate(
            "/login?toast=You+need+to+log+in+to+subscribe&toast_type=info",
          );
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          toast.info("You're already subscribed to this plan");
          return;
        }
        toast.error(
          err instanceof Error ? err.message : "Subscription failed.",
        );
      },
    },
  );

  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      loading={loading}
      onClick={handleSubscribe}
    >
      <Zap className="mr-2 h-4 w-4" />
      Subscribe — {price} {currency}
      {billingIntervalSuffix(intervalMonths)}
    </Button>
  );
}
