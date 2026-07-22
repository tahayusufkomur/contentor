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
 *
 * `partial` swaps the tooltip to "Contains paid features" — use it on a nav
 * item whose section is only *partly* paid (e.g. Live, where Zoom + on-site
 * events are free), so the badge doesn't imply the whole section is paid.
 */
export function PaidBadge({
  className,
  partial,
}: {
  className?: string;
  partial?: boolean;
}) {
  const t = useTranslations("admin");
  return (
    <Badge
      variant="pro"
      title={t(partial ? "badges.paidPartialTooltip" : "badges.paidTooltip")}
      className={className}
    >
      <Lock aria-hidden="true" />
      {t("badges.paid")}
    </Badge>
  );
}

/**
 * Renders a {@link PaidBadge} only when the current plan lacks `feature`.
 * Nothing renders while entitlements are still loading (or on a failed fetch),
 * so the badge never flashes on for a paying coach. Pass `partial` when the
 * badge sits on a section that is only partly paid.
 */
export function PaidFeatureBadge({
  feature,
  className,
  partial,
}: {
  feature: EntitlementKey;
  className?: string;
  partial?: boolean;
}) {
  const locked = useIsLocked(feature);
  if (!locked) return null;
  return <PaidBadge className={className} partial={partial} />;
}
