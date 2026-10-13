"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import AnnouncementCompose from "@/components/admin/announcement-compose";
import { RichEditorProvider } from "@/components/owner/rich-editor";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import {
  draftToComposePrefill,
  getAnnouncement,
  type ComposePrefill,
} from "@/lib/announcements";
import { useNavigate } from "@shared/navigation/navigation-provider";

const BACK = "/admin/messages";

/** The one place a message is written. `?draft=<id>` opens a draft the
 *  assistant left for her to review. */
export default function NewMessagePage() {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const draftId = Number(useSearchParams().get("draft")) || null;
  const [reviewDraft, setReviewDraft] = useState<{
    id: number;
    prefill: ComposePrefill;
  } | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    getAnnouncement(draftId)
      .then((draft) => {
        if (cancelled) return;
        // Only a draft is reviewed here; anything else has its own page.
        if (draft.status !== "draft") navigate(`${BACK}/${draft.id}`);
        else
          setReviewDraft({
            id: draft.id,
            prefill: draftToComposePrefill(draft),
          });
      })
      .catch(() => {
        if (!cancelled) toast.error(t("draftGone"));
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, navigate, t]);

  return (
    <RichEditorProvider>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <NavLink href={BACK} aria-label={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </NavLink>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("new")}</h1>
            <p className="text-sm text-muted-foreground">
              {t.rich("newSubtitle", {
                design: (chunks) => (
                  <NavLink
                    href="/admin/messages/email/new"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {chunks}
                  </NavLink>
                ),
              })}
            </p>
          </div>
        </div>
        <AnnouncementCompose
          onSent={() => navigate(BACK)}
          reviewDraft={reviewDraft}
          onDraftReviewed={() => navigate(BACK)}
        />
      </div>
    </RichEditorProvider>
  );
}
