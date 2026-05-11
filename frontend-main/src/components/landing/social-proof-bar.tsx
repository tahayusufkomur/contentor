"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

const CATEGORY_KEYS = ["fitness", "music", "dance", "education", "wellness"] as const;

export function SocialProofBar() {
  const t = useTranslations("marketing.socialProof");
  return (
    <section className="border-y bg-brand-surface px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-center text-lg text-muted-foreground">{t("tagline")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {CATEGORY_KEYS.map((key) => (
            <Badge key={key} variant="brand">
              {t(`categories.${key}`)}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
