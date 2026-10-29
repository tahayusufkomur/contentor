"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangePlanCard } from "@/app/admin/billing/subscription/ChangePlanCard";
import { SubscriptionTile } from "@/app/admin/billing/subscription/SubscriptionTile";

/** Every admin page while the site is paused (a plan needed, none running):
 * what it means, then the plan picker. A plan that starts lifts it. */
export function PausedPlanPicker() {
  const t = useTranslations("admin");
  const router = useRouter();
  const checkout = useSearchParams().get("checkout");
  const onLive = useCallback(() => router.refresh(), [router]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("paused.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("paused.hint")}</p>
      </div>
      <SubscriptionTile
        pollUntilActive={checkout === "success"}
        showCanceledNotice={checkout === "cancel"}
        onLive={onLive}
      />
      <ChangePlanCard />
    </div>
  );
}
