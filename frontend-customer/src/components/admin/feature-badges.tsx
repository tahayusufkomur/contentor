"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

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
