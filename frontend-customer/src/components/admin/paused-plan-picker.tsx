"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangePlanCard } from "@/app/admin/billing/subscription/ChangePlanCard";
import { SubscriptionTile } from "@/app/admin/billing/subscription/SubscriptionTile";

/** Every admin page while the site is paused (a plan needed, none running):
 * what it means, then the plan picker. A plan that starts lifts it. */
export function PausedPlanPicker() {
  const router = useRouter();
  const checkout = useSearchParams().get("checkout");
  const onLive = useCallback(() => router.refresh(), [router]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pick a plan to open your site
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Until you do, visitors see a “back soon” page. Everything you built is
          kept and comes back the moment you start.
        </p>
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
