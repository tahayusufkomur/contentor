"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { DownloadForm } from "@/components/admin/download-form";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";

export default function NewDownloadPage() {
  const t = useTranslations("admin.downloads");
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <NavLink href="/admin/downloads" aria-label={t("back")}>
            <ArrowLeft className="h-4 w-4" />
          </NavLink>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t("new")}</h1>
      </div>
      <DownloadForm />
    </div>
  );
}
