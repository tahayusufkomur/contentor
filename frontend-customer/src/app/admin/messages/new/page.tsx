"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import AnnouncementCompose from "@/components/admin/announcement-compose";
import { FocusStart } from "@/components/focus/focus-start";
import { RichEditorProvider } from "@/components/owner/rich-editor";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  draftToComposePrefill,
  getAnnouncement,
  type ComposePrefill,
} from "@/lib/announcements";
import {
  startActiveTime,
  stopActiveTime,
  takeActiveMs,
} from "@/lib/focus/active-time";
import { fetchCreation, leaveCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import {
  activeCreation,
  clearActiveCreation,
  openCreationAt,
  refreshFocusOverview,
  setActiveCreation,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import { useNavigate } from "@shared/navigation/navigation-provider";

const BACK = "/admin/messages";
const TIME_KEY = focusTimeKey("message");

/** The one place a message is written. `?draft=<id>` opens a draft the
 *  assistant left for her to review, or the one she is writing in focus mode.
 *  With focus mode on for messages, New asks one question at a time; `?form=1`
 *  is today's composer ("Write it myself"). */
export default function NewMessagePage() {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const params = useSearchParams();
  const draftId = Number(params.get("draft")) || null;
  const plain = params.get("form") === "1";
  const overview = useFocusOverview();
  const active = useActiveCreation();
  const first = overview?.first.message;
  const focusOn = !!overview?.enabled && !!first;

  // A draft she is still writing in focus mode reopens there, where she
  // stopped; the guide and the composer follow the creation from here.
  const path = draftId ? `${BACK}/new?draft=${draftId}` : null;
  const creationId = path
    ? (openCreationAt(overview, path) ??
      (active?.record?.path === path ? active.id : null))
    : null;
  const focusing =
    !!path && !!active && active.id !== 0 && active.record?.path === path;
  const [known, setKnown] = useState<number | null>(null);
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(TIME_KEY);
    if (activeCreation()?.id === creationId) {
      setKnown(creationId); // just made on the first screen
      return;
    }
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setKnown(creationId);
      });
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  // Until it is known which, no composer: her focus draft must never open as
  // a review first.
  const deciding =
    overview === null || (!!creationId && !focusing && known !== creationId);
  const focusNew = focusOn && !plain && !draftId;

  // From the first screen's "Write it myself": focus mode ends here, as the
  // guide's own "Write it myself" ends it.
  const plainNew = !deciding && !draftId && !focusNew;
  useEffect(() => {
    if (!plainNew || !focusOn) return;
    const left = activeCreation();
    if (left?.kind !== "message") return;
    if (left.id)
      void leaveCreation(left.id, {
        abandon: !left.record,
        active_ms: takeActiveMs(TIME_KEY),
      })
        .catch(() => {})
        .finally(() => void refreshFocusOverview());
    stopActiveTime(TIME_KEY);
    clearActiveCreation(left.id);
  }, [plainNew, focusOn]);

  // A draft outside focus mode is reviewed: a copy of it is sent, then it is deleted.
  const [reviewDraft, setReviewDraft] = useState<{
    id: number;
    prefill: ComposePrefill;
  } | null>(null);
  useEffect(() => {
    if (!draftId || deciding || focusing) return;
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
  }, [draftId, deciding, focusing, navigate, t]);

  const copy = active?.copy;
  const focus =
    focusing && draftId
      ? {
          record: draftId,
          // A failed or stopped run is not replayed: the page keeps what is saved.
          runId:
            copy?.status === "building" || copy?.status === "ready"
              ? copy.run
              : null,
        }
      : undefined;

  return (
    <RichEditorProvider>
      <PageState
        loading={deciding}
        skeleton={<Skeleton className="mx-auto h-48 w-full max-w-2xl" />}
        // The composer sits beside its phone preview; the opening question alone.
        className={`mx-auto space-y-6 ${focusNew && first ? "max-w-2xl" : "max-w-4xl"}`}
      >
        {focusNew && first ? (
          <FocusStart kind="message" question={first}>
            <MessageSlots />
          </FocusStart>
        ) : (
          <>
            {!focusing && (
              <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="icon">
                  <NavLink href={BACK} aria-label={t("back")}>
                    <ArrowLeft className="h-4 w-4" />
                  </NavLink>
                </Button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {t("new")}
                  </h1>
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
            )}
            {/* Keyed by draft: another draft never takes this one's state. The
                same composer stays when focus mode ends, holding her text. */}
            <AnnouncementCompose
              key={draftId ?? "new"}
              onSent={() => navigate(BACK)}
              reviewDraft={reviewDraft?.id === draftId ? reviewDraft : null}
              onDraftReviewed={() => navigate(BACK)}
              focus={focus}
            />
          </>
        )}
      </PageState>
    </RichEditorProvider>
  );
}

/** The composer, still empty, before her first answer makes the draft. */
function MessageSlots() {
  const slot = "rounded-lg border border-dashed border-border bg-muted/30";
  return (
    <div
      aria-hidden
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <div className={`h-9 ${slot}`} />
      <div className={`h-24 ${slot}`} />
    </div>
  );
}
