"use client";

import { Lock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { useIsLocked } from "@/components/admin/entitlements-provider";
import type { EntitlementKey } from "@/lib/entitlements";

/**
 * "AI" pill — marks an AI-powered feature. Always renders (a feature is AI
 * regardless of the coach's plan). Uses the same `brand` treatment already used
 * for AI-generated blog posts.
 */
export function AiBadge({ className }: { className?: string }) {
  const t = useTranslations("admin");
  return (
    <Badge variant="brand" title={t("badges.aiTooltip")} className={className}>
      <Sparkles aria-hidden="true" />
      {t("badges.ai")}
    </Badge>
  );
}

/**
 * "Paid" pill — marks a feature the coach's current plan does not include.
 * Purely presentational: it always renders when mounted. Gate visibility with
 * {@link PaidFeatureBadge} (or `useIsLocked`) so it only shows when locked.
 */
export function PaidBadge({ className }: { className?: string }) {
  const t = useTranslations("admin");
  return (
    <Badge variant="pro" title={t("badges.paidTooltip")} className={className}>
      <Lock aria-hidden="true" />
      {t("badges.paid")}
    </Badge>
  );
}

/**
 * Renders a {@link PaidBadge} only when the current plan lacks `feature`.
 * Nothing renders while entitlements are still loading (or on a failed fetch),
 * so the badge never flashes on for a paying coach.
 */
export function PaidFeatureBadge({
  feature,
  className,
}: {
  feature: EntitlementKey;
  className?: string;
}) {
  const locked = useIsLocked(feature);
  if (!locked) return null;
  return <PaidBadge className={className} />;
}
