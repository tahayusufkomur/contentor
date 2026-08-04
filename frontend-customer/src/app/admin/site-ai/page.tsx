"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** The AI editing surface moved onto the site itself (Coach Copilot,
 * spec 2026-08-04). This page is now just the discoverable admin entry. */
export default function AdminSiteAiPage() {
  const t = useTranslations("admin");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("siteAi.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("siteAi.subtitle")}</p>
      </div>
      <Button asChild variant="brand">
        <a href="/?copilot=1" target="_blank" rel="noopener noreferrer">
          <Sparkles className="size-4" aria-hidden />
          {t("siteAi.launch")}
        </a>
      </Button>
    </div>
  );
}
