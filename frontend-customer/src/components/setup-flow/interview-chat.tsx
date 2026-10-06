"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MicButton } from "@/components/copilot/mic-button";
import { joinSpeech, splitEntries } from "@/lib/interview";
import {
  DELEGATE,
  type GuideTurn,
  type InterviewEntry,
  type LookCards,
  type TurnRequest,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { LookCardsView } from "./look-cards";

/** The guide's conversation: one question at a time, tap-able answers, a
 * "you decide" way out, and typing or dictation. */
export function InterviewChat({
  entries,
  guide,
  sending,
  activity,
  remaining,
  wide,
  onSend,
  onUndo,
  onMoreLogos,
  footer,
  restore,
  className,
}: {
  entries: InterviewEntry[];
  guide: GuideTurn;
  sending: boolean;
  /** What the guide is building right now, shown above the answer box. */
  activity: string | null;
  remaining: number;
  /** Full-width first phase vs. the side panel once the site is building. */
  wide: boolean;
  onSend: (req: TurnRequest) => void;
  onUndo: (auditId: number) => void;
  onMoreLogos: (page: number) => Promise<LookCards>;
  footer?: React.ReactNode;
  /** Text of a send that failed: put back into the box. */
  restore?: { text: string; at: number } | null;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [hearing, setHearing] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  useEffect(() => setTicked([]), [guide.question]);
  const spoken = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (restore) setDraft((d) => d || restore.text);
  }, [restore]);
  // A turn can wait behind site building on the shared AI hub; say so
  // honestly instead of leaving a bare spinner.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!sending) return;
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, [sending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length, sending, guide]);

  // The latest guide question is drawn live below (with its chips); the
  // transcript holds everything else.
  const { past, after } = splitEntries(entries, sending);
  const entry = (e: InterviewEntry, i: number) =>
    e.role === "coach" ? (
      <p
        key={i}
        className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--sf-tint-strong)] px-3.5 py-2.5 text-[15px] leading-relaxed"
      >
        {e.text}
      </p>
    ) : (
      <div key={i} className="mr-6 text-[15px] leading-relaxed">
        {e.ack && <p className="text-[var(--sf-graphite)]">{e.ack}</p>}
        {e.status && <StatusLine text={e.status} />}
        {e.question && <p className="mt-1">{e.question}</p>}
        {e.audit_id != null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUndo(e.audit_id as number)}
            className="-ml-2 mt-1 h-7 rounded-full px-2.5"
          >
            <Undo2 aria-hidden />
            Undo
          </Button>
        )}
      </div>
    );

  const submit = () => {
    const text = joinSpeech(draft, hearing).trim();
    if (!text || sending) return;
    onSend({ message: text, spoken: spoken.current });
    setDraft("");
    setHearing("");
    spoken.current = false;
  };
  const pick = (req: TurnRequest) => {
    if (!sending) onSend(req);
  };

  return (
    <section
      aria-label="Your setup guide"
      className={cn("min-h-0 flex-col bg-[var(--sf-paper)]", className)}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div
          className={cn(
            "mx-auto space-y-5",
            wide ? "max-w-[640px]" : "max-w-none",
          )}
        >
          {past.map(entry)}

          {sending ? (
            <p className="flex items-center gap-2 text-[var(--sf-graphite)]">
              <Spinner size="sm" className="text-[var(--sf-brass)]" />
              {slow
                ? "Still thinking. Your site is being built at the same time, so this can take a little longer."
                : "Thinking…"}
            </p>
          ) : (
            <div className="motion-safe:animate-fade-in-up">
              {guide.ack && (
                <p className="text-[15px] leading-relaxed text-[var(--sf-graphite)]">
                  {guide.ack}
                </p>
              )}
              {guide.status && <StatusLine text={guide.status} />}
              {after.length > 0 && (
                <div className="my-5 space-y-5">{after.map(entry)}</div>
              )}
              <p
                className={cn(
                  "mt-1 font-semibold tracking-[-0.015em]",
                  wide
                    ? "text-[24px] leading-[1.2] sm:text-[28px]"
                    : "text-[17px] leading-snug",
                )}
              >
                {guide.question}
              </p>
              {guide.cards && guide.field && (
                <LookCardsView
                  key={`${guide.field}-${entries.length}`}
                  cards={guide.cards}
                  disabled={sending}
                  onMore={onMoreLogos}
                  onPick={(value, label) =>
                    pick({
                      message: label,
                      choice: { field: guide.field as string, value },
                    })
                  }
                />
              )}
              {(guide.options.length > 0 || guide.can_delegate) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {guide.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={
                        guide.multi ? ticked.includes(o) : undefined
                      }
                      onClick={() =>
                        guide.multi
                          ? setTicked((t) =>
                              t.includes(o)
                                ? t.filter((x) => x !== o)
                                : [...t, o],
                            )
                          : pick({ message: o })
                      }
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-left text-[13px] transition-colors hover:border-[var(--sf-line-strong)] hover:bg-[var(--sf-tint)]",
                        guide.multi && ticked.includes(o)
                          ? "border-[var(--sf-line-strong)] bg-[var(--sf-tint-strong)]"
                          : "border-[var(--sf-line)] bg-white",
                      )}
                    >
                      {o}
                    </button>
                  ))}
                  {guide.multi && guide.options.length > 1 && (
                    <button
                      type="button"
                      aria-pressed={ticked.length === guide.options.length}
                      onClick={() => setTicked([...guide.options])}
                      className="rounded-full border border-[var(--sf-line)] bg-white px-3.5 py-1.5 text-[13px] transition-colors hover:border-[var(--sf-line-strong)] hover:bg-[var(--sf-tint)]"
                    >
                      All of them
                    </button>
                  )}
                  {guide.multi && ticked.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => pick({ message: ticked.join(", ") })}
                      className="rounded-full px-4"
                    >
                      Continue
                    </Button>
                  )}
                  {guide.can_delegate && guide.field && (
                    <button
                      type="button"
                      onClick={() =>
                        pick({
                          message: "You decide for me.",
                          choice: {
                            field: guide.field as string,
                            value: DELEGATE,
                          },
                        })
                      }
                      className="rounded-full px-3.5 py-1.5 text-[13px] text-[var(--sf-graphite)] underline-offset-4 hover:underline"
                    >
                      You decide
                    </button>
                  )}
                </div>
              )}
              {remaining > 0 && (
                <p className="mt-4 text-[12.5px] text-[var(--sf-faint)]">
                  About {remaining} {remaining === 1 ? "question" : "questions"}{" "}
                  left
                </p>
              )}
            </div>
          )}
          {footer}
        </div>
      </div>

      <form
        className={cn(
          "shrink-0 border-t border-[var(--sf-line)] px-4 py-3",
          wide && "lg:border-0 lg:pb-8",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {activity && (
          <p
            role="status"
            className={cn(
              "mx-auto mb-2 flex items-center gap-2 px-1 text-[13px] text-[var(--sf-graphite)]",
              wide ? "max-w-[640px]" : "max-w-none",
            )}
          >
            <Spinner size="sm" className="text-[var(--sf-brass)]" />
            <span className="truncate">{activity}</span>
          </p>
        )}
        <div
          className={cn(
            "mx-auto rounded-2xl border border-[var(--sf-line-strong)] bg-white",
            wide ? "max-w-[640px]" : "max-w-none",
          )}
        >
          <textarea
            aria-label="Your answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Type your answer…"
            className="block w-full resize-none rounded-2xl bg-transparent px-4 pt-3 text-[15px] leading-relaxed focus:outline-none"
          />
          {hearing && (
            <p
              aria-live="polite"
              className="px-4 text-[13px] italic text-[var(--sf-faint)]"
            >
              {hearing}
            </p>
          )}
          <div className="flex items-center justify-between px-2.5 pb-2.5">
            <MicButton
              disabled={sending}
              className="p-1.5"
              onText={(text, final) => {
                if (final) {
                  setDraft((d) => joinSpeech(d, text));
                  setHearing("");
                  spoken.current = true;
                } else {
                  setHearing(text);
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              loading={sending}
              loadingText="Sending…"
              disabled={!joinSpeech(draft, hearing).trim()}
              className="rounded-full px-4"
            >
              Send
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

/** The guide noting work it just started, set apart from its question. */
function StatusLine({ text }: { text: string }) {
  return (
    <p className="mt-1.5 flex gap-2.5 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
      <span
        aria-hidden
        className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--sf-brass)]"
      />
      {text}
    </p>
  );
}
