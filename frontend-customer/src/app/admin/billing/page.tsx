"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { ChangePlanCard } from "./subscription/ChangePlanCard";
import { SubscriptionTile } from "./subscription/SubscriptionTile";

const STORE_TABS = ["products", "bundles", "plans"];

/** The coach's own Contentor plan. What she sells lives in /admin/store. */
export default function PlanPage() {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const tab = searchParams.get("tab");

  // Old links: /admin/billing?tab=products|bundles|plans.
  useEffect(() => {
    if (tab && STORE_TABS.includes(tab)) navigate(`/admin/store?tab=${tab}`);
  }, [tab, navigate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.plan")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("plan.subtitle")}</p>
      </div>
      <SubscriptionTile
        pollUntilActive={checkout === "success"}
        showCanceledNotice={checkout === "cancel"}
      />
      <ChangePlanCard />
    </div>
  );
}
