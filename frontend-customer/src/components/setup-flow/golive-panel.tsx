"use client";

import {
  ArrowRight,
  Check,
  Eye,
  MousePointerClick,
  Pencil,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SelectionPayload } from "@/lib/copilot/types";
import type { ReviewPage } from "@/lib/interview";
import type {
  GuideTurn,
  SetupFlowApi,
  TeamLine,
  TurnRequest,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { AnswerBox } from "./answer-box";
import { GoLiveCard } from "./go-live-card";

/** The pages looked over one by one before going live. */
export interface PageReviewProps {
  pages: ReviewPage[];
  /** The page on screen, or the next one to approve. */
  focus: ReviewPage;
  /** The preview shows ``focus`` (not some other page she browsed to). */
  shown: boolean;
  approving: boolean;
  onApprove: () => void;
  /** Open the page in the site's editor. */
  onEdit: () => void;
  /** Show another page in the preview. */
  onShow: (page: ReviewPage) => void;
  /** The part of the page she tapped in the preview: the change is to it. */
  picked?: { selection: SelectionPayload; label: string; onClear: () => void };
}

/** The last stretch, beside the finished site: each page looked over and
 * approved (with a box for changes to it), then going live. */
export function GoLivePanel({
  guide,
  api,
  sending,
  activity,
  text,
  onText,
  onSend,
  onPublished,
  menu,
  onSeeSite,
  host,
  review,
  className,
}: {
  guide: GuideTurn;
  api: SetupFlowApi;
  sending: boolean;
  /** What is still being built, if anything. */
  activity: string | null;
  text: string;
  onText: (update: (prev: string) => string) => void;
  onSend: (req: TurnRequest) => void;
  onPublished: (team: TeamLine[]) => void;
  /** The setup menu (finish later, help, sign out), top right. */
  menu?: React.ReactNode;
  /** On a phone the site is a tab away: a card opens it. */
  onSeeSite?: () => void;
  host?: string;
  /** Set while a page is still to approve: the panel walks through them. */
  review?: PageReviewProps;
  className?: string;
}) {
  // While pages still build the site is not ready yet: say what is left
  // (it used to say "Your site is ready" above a skeleton).
  const t = useTranslations("admin.setupFlow");
  const busy = sending ? t("panel.making") : null;
  return (
    <section
      aria-label={t("panel.aria")}
      className={cn(
        "relative min-h-0 flex-col bg-[var(--sf-paper)]",
        className,
      )}
    >
      {menu && <div className="absolute right-3 top-3 z-10">{menu}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {guide.ack && (
          <p className="text-[15px] leading-relaxed text-[var(--sf-graphite)]">
            {guide.ack}
          </p>
        )}
        {review ? (
          <PageReview {...review} sending={sending} />
        ) : (
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            {activity ? t("panel.almostReady") : guide.question}
          </h1>
        )}
        {activity && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-[14.5px] text-[var(--sf-graphite)]"
          >
            <Spinner size="sm" className="text-[var(--sf-brass)]" />
            {activity}
          </p>
        )}
        {onSeeSite && (
          <button
            type="button"
            onClick={onSeeSite}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[var(--sf-line)] bg-white p-3 text-left transition-colors hover:border-[var(--sf-line-strong)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-tint-strong)]">
              <Eye className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">
                {t("panel.seeSite")}
              </span>
              {host && (
                <span className="block truncate text-[12.5px] text-[var(--sf-graphite)]">
                  {host}
                </span>
              )}
            </span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </button>
        )}
        {!review && (
          <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--sf-graphite)]">
            {t("panel.askHint")}
          </p>
        )}
        {/* Mounted while she reviews, so the last visual check starts then. */}
        <div className={review ? "hidden" : "mt-6"}>
          <GoLiveCard api={api} onPublished={onPublished} />
        </div>
      </div>
      <div className="shrink-0 border-t border-[var(--sf-line)] px-4 py-3">
        {busy && (
          <p
            role="status"
            className="mb-2 flex items-center gap-2 px-1 text-[13px] text-[var(--sf-graphite)]"
          >
            <Spinner size="sm" className="text-[var(--sf-brass)]" />
            <span className="truncate">{busy}</span>
          </p>
        )}
        {review?.picked && (
          <p className="mb-2 flex items-center gap-2 px-1 text-[13px] text-[var(--sf-graphite)]">
            <MousePointerClick
              className="size-4 shrink-0 text-[var(--sf-brass)]"
              aria-hidden
            />
            <span className="min-w-0 truncate">
              {t.rich("panel.changing", {
                label: review.picked.label,
                b: (chunks) => (
                  <strong className="font-medium text-[var(--sf-ink)]">
                    {chunks}
                  </strong>
                ),
              })}
            </span>
            <button
              type="button"
              onClick={review.picked.onClear}
              aria-label={t("panel.changeWhole")}
              className="ml-auto rounded-full p-1 text-[var(--sf-faint)] transition-colors hover:bg-[var(--sf-tint-strong)] hover:text-[var(--sf-ink)]"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </p>
        )}
        <AnswerBox
          value={text}
          onChange={onText}
          sending={sending}
          placeholder={
            review?.picked
              ? t("panel.placeholderPicked")
              : review
                ? t("panel.placeholderPage", { page: review.focus.key })
                : t("panel.placeholderAsk")
          }
          onSubmit={(words, spoken) =>
            onSend({
              message: words,
              spoken,
              page: review?.focus.key,
              selection: review?.picked?.selection,
            })
          }
        />
      </div>
    </section>
  );
}

/** One page at a time: is she happy with it? Approved, the next one opens. */
function PageReview({
  pages,
  focus,
  shown,
  approving,
  onApprove,
  onEdit,
  onShow,
  sending,
}: PageReviewProps & { sending: boolean }) {
  const t = useTranslations("admin.setupFlow");
  const pageName = (key: string) =>
    t.has(`page.name.${key}` as never) ? t(`page.name.${key}` as never) : key;
  const index = pages.findIndex((p) => p.key === focus.key);
  const left = pages.filter((p) => !p.ok).length;
  return (
    <>
      <p className="text-[12.5px] font-medium text-[var(--sf-faint)]">
        {t("panel.progress", { n: index + 1, total: pages.length })}
      </p>
      <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
        {t("panel.happy", { page: focus.key })}
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--sf-graphite)]">
        {t("panel.lookOver")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!shown ? (
          <Button
            onClick={() => onShow(focus)}
            className="rounded-full h-auto min-h-9 whitespace-normal py-2 text-center px-5"
          >
            {t("panel.showPage", { page: focus.key })}
          </Button>
        ) : focus.ok ? (
          <p className="flex items-center gap-1.5 text-[14px] font-medium">
            <Check className="size-4 text-[var(--sf-brass)]" aria-hidden />
            {t("panel.approvedLeft", { count: left })}
          </p>
        ) : (
          <Button
            onClick={onApprove}
            loading={approving}
            loadingText={t("panel.saving")}
            disabled={focus.building || sending}
            className="rounded-full h-auto min-h-9 whitespace-normal py-2 text-center px-5"
          >
            {t("panel.approve")}
          </Button>
        )}
        {shown && (
          <Button
            variant="outline"
            onClick={onEdit}
            // The editor saves every page at once: not while one is still being written.
            disabled={sending || pages.some((p) => p.building)}
            className="rounded-full h-auto min-h-9 whitespace-normal py-2 text-center px-5"
          >
            <Pencil aria-hidden />
            {t("panel.editPage")}
          </Button>
        )}
        {focus.building && (
          <span className="text-[13.5px] text-[var(--sf-graphite)]">
            {t("panel.stillBuilding")}
          </span>
        )}
      </div>
      <ol aria-label={t("panel.pagesAria")} className="mt-6 space-y-1">
        {pages.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => onShow(p)}
              aria-current={p.key === focus.key ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] transition-colors hover:bg-[var(--sf-tint-strong)]",
                p.key === focus.key && "bg-white ring-1 ring-[var(--sf-line)]",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11.5px]",
                  p.ok
                    ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-white"
                    : "border-[var(--sf-line-strong)] text-[var(--sf-graphite)]",
                )}
              >
                {p.ok ? (
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                ) : p.building ? (
                  <Spinner size="sm" />
                ) : (
                  pages.indexOf(p) + 1
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {pageName(p.key)}
              </span>
              <span className="text-[12.5px] text-[var(--sf-faint)]">
                {p.ok
                  ? t("panel.state.approved")
                  : p.building
                    ? t("panel.state.building")
                    : t("panel.state.toReview")}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
