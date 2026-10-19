"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { DownloadForm } from "@/components/admin/download-form";
import { FocusStart } from "@/components/focus/focus-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { clearActiveCreation, useFocusOverview } from "@/lib/focus/store";

/** With focus mode on for downloads, New asks one question at a time; her
 *  first answer makes the hidden draft and moves to its page. `?form=1` is
 *  the plain form ("Fill it in myself"). */
export default function NewDownloadPage() {
  const overview = useFocusOverview();
  const plain = useSearchParams().get("form") === "1";
  const first = overview?.first.download;
  return (
    <PageState
      loading={overview === null}
      skeleton={<SkeletonForm fields={5} />}
    >
      {overview?.enabled && first && !plain ? (
        <FocusStart kind="download" question={first}>
          <DownloadSlots />
        </FocusStart>
      ) : (
        <PlainNewDownload />
      )}
    </PageState>
  );
}

function PlainNewDownload() {
  const t = useTranslations("admin.downloads");
  useEffect(() => {
    clearActiveCreation(0); // from the focus screen's "Fill it in myself"
  }, []);
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

/** The download page, still empty, before her first answer makes the draft. */
function DownloadSlots() {
  const t = useTranslations("admin.downloads");
  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <Card aria-hidden>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <Label>{t("title")}</Label>
          <div className={`h-10 ${slot}`} />
        </div>
        <div className="space-y-2">
          <Label>{t("description")}</Label>
          <div className={`h-20 ${slot}`} />
        </div>
        <div className="space-y-2">
          <Label>{t("cover")}</Label>
          <div className={`aspect-video w-48 ${slot}`} />
        </div>
        <div className="space-y-2">
          <Label>{t("file")}</Label>
          <div className={`h-24 ${slot}`} />
        </div>
      </CardContent>
    </Card>
  );
}
