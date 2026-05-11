"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const t = useTranslations("common.language");
  const router = useRouter();
  const currentLocale = useLocale();
  const [busy, setBusy] = useState(false);

  const other: "en" | "tr" = currentLocale === "tr" ? "en" : "tr";
  const label = other === "tr" ? t("switchToTurkish") : t("switchToEnglish");

  async function flip() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/users/me/locale/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: other }),
        credentials: "same-origin",
      }).catch(() => null);
      // Always set the cookie client-side too so anonymous users get the toggle.
      document.cookie = `user-locale=${other}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={flip}
      disabled={busy}
      className="gap-1.5"
      aria-label={t("label")}
    >
      <Languages className="h-4 w-4" />
      {label}
    </Button>
  );
}
