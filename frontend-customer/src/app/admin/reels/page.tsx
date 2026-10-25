"use client";

import { useTranslations } from "next-intl";
import { ReelsHome } from "@/components/admin/reels/reels-home";

export const dynamic = "force-dynamic";

/** Short vertical clips of the coach's videos, for Instagram Reels, TikTok and YouTube Shorts. */
export default function ReelsPage() {
  const t = useTranslations("admin");
  return (
    <div className="space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.reels")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("reels.subtitle")}</p>
      </div>
      <ReelsHome />
    </div>
  );
}
