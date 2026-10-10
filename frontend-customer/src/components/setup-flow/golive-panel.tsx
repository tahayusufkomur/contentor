"use client";

import { ArrowRight, Eye } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { GuideTurn, SetupFlowApi, TurnRequest } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { AnswerBox } from "./answer-box";
import { GoLiveCard } from "./go-live-card";

/** The last stretch, beside the finished site: going live, and a box for
 * any change the coach still wants first. */
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
  onPublished: () => void;
  /** The setup menu (finish later, help, sign out), top right. */
  menu?: React.ReactNode;
  /** On a phone the site is a tab away: a card opens it. */
  onSeeSite?: () => void;
  host?: string;
  className?: string;
}) {
  // While pages still build the site is not ready yet: say what is left
  // (it used to say "Your site is ready" above a skeleton).
  const busy = sending ? "Making that change…" : null;
  return (
    <section
      aria-label="Your setup guide"
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
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          {activity ? "Almost ready" : guide.question}
        </h1>
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
                See your site
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
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--sf-graphite)]">
          Want something changed first? Tell me below, like “make the headline
          warmer” or “use a calmer photo”.
        </p>
        <div className="mt-6">
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
        <AnswerBox
          value={text}
          onChange={onText}
          sending={sending}
          placeholder="Ask for a change…"
          onSubmit={(t, spoken) => onSend({ message: t, spoken })}
        />
      </div>
    </section>
  );
}
