"use client";

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
  className?: string;
}) {
  const busy = sending ? "Making that change…" : activity;
  return (
    <section
      aria-label="Your setup guide"
      className={cn("min-h-0 flex-col bg-[var(--sf-paper)]", className)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {guide.ack && (
          <p className="text-[15px] leading-relaxed text-[var(--sf-graphite)]">
            {guide.ack}
          </p>
        )}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          {guide.question}
        </h1>
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
