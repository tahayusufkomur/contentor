"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { pickedOptions, type QuestionStep } from "@/lib/interview";
import {
  DELEGATE,
  DELEGATE_TEXT,
  type LookCards,
  type TurnRequest,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { AnswerBox } from "./answer-box";
import { LookCardsView } from "./look-cards";

/** What the coach has ticked or typed on a question but not sent yet. */
export interface StepDraft {
  ticked?: string[];
  text?: string;
}

/** One interview question on the whole screen: big answer tiles (any number
 * of them on a multi question), "You decide", or a typed or dictated answer.
 * A question the coach already answered shows their answer, ready to change.
 * Unsent ticks and text live in ``draft`` so moving between questions keeps
 * them. */
export function QuestionScreen({
  step,
  cards,
  live,
  sending,
  draft,
  onDraft,
  onSend,
  onMoreLogos,
}: {
  step: QuestionStep;
  /** Look cards (style, logo) for this question, if it is one. */
  cards?: LookCards | null;
  /** The question being asked now, vs. one the coach went back to. */
  live: boolean;
  sending: boolean;
  draft: StepDraft;
  onDraft: (update: (d: StepDraft) => StepDraft) => void;
  onSend: (req: TurnRequest) => void;
  onMoreLogos: (page: number) => Promise<LookCards>;
}) {
  const multi = !!step.multi && step.options.length > 1;
  const picked = pickedOptions(step);
  const ticked = draft.ticked ?? (multi ? picked : []);
  // A typed answer (not a tile, a card or "you decide") goes back in the box.
  const typed =
    !live &&
    !cards &&
    !picked.length &&
    step.answer &&
    step.answer !== DELEGATE_TEXT
      ? step.answer
      : "";
  // A turn can take a while when the model is busy; say so honestly.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!sending) return;
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, [sending]);

  const send = (req: TurnRequest) => {
    if (sending) return;
    onSend(live || !step.field ? req : { ...req, field: step.field });
  };
  const setTicked = (next: (t: string[]) => string[]) =>
    onDraft((d) => ({ ...d, ticked: next(d.ticked ?? ticked) }));
  const toggle = (o: string) =>
    setTicked((t) => (t.includes(o) ? t.filter((x) => x !== o) : [...t, o]));

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center px-5 py-8 sm:px-10">
        <div className="motion-safe:animate-[sf-rise_.45s_ease-out_both]">
          {live ? (
            <>
              {step.ack && (
                <p className="max-w-[72ch] text-[16px] leading-relaxed text-[var(--sf-graphite)]">
                  {step.ack}
                </p>
              )}
              {step.status && (
                <p className="mt-2 flex max-w-[72ch] gap-2.5 text-[15px] leading-relaxed text-[var(--sf-graphite)]">
                  <span
                    aria-hidden
                    className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--sf-brass)]"
                  />
                  {step.status}
                </p>
              )}
            </>
          ) : (
            step.answer &&
            !typed && (
              <p className="max-w-[72ch] text-[15px] text-[var(--sf-graphite)]">
                You said:{" "}
                <span className="text-[var(--sf-ink)]">{step.answer}</span>
              </p>
            )
          )}
          <h1 className="mt-3 max-w-[32ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[42px]">
            {step.question}
          </h1>

          {cards && step.field && (
            <LookCardsView
              cards={cards}
              selected={live ? undefined : step.answer}
              disabled={sending}
              onMore={onMoreLogos}
              onPick={(value, label) =>
                send({
                  message: label,
                  choice: { field: step.field as string, value },
                })
              }
            />
          )}

          {step.options.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {step.options.map((o, i) => {
                const on = multi ? ticked.includes(o) : picked.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={multi ? on : undefined}
                    disabled={sending}
                    onClick={() => (multi ? toggle(o) : send({ message: o }))}
                    style={{ animationDelay: `${Math.min(i, 15) * 22}ms` }}
                    className={cn(
                      "relative flex min-h-[68px] items-center rounded-2xl border px-4 py-3 text-left text-[15.5px] font-medium leading-snug",
                      "transition-[background-color,border-color,box-shadow,transform] duration-200 motion-safe:animate-[sf-rise_.4s_ease-out_both] motion-safe:hover:-translate-y-0.5 disabled:pointer-events-none",
                      on
                        ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)] shadow-[0_10px_24px_-14px_rgb(34_33_31/0.6)]"
                        : "border-[var(--sf-line)] bg-white hover:border-[var(--sf-line-strong)] hover:shadow-[0_10px_24px_-16px_rgb(48_36_20/0.45)]",
                      sending && !on && "opacity-55",
                    )}
                  >
                    <span className={cn(multi && "pr-7")}>{o}</span>
                    {multi && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute right-3.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border",
                          on
                            ? "border-[var(--sf-paper)] bg-[var(--sf-paper)] text-[var(--sf-ink)]"
                            : "border-[var(--sf-line-strong)]",
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex min-h-11 flex-wrap items-center gap-2">
            {sending ? (
              <p className="flex items-center gap-2 text-[15px] text-[var(--sf-graphite)]">
                <Spinner size="sm" className="text-[var(--sf-brass)]" />
                {slow
                  ? "Still thinking. Your site is being built at the same time, so this can take a little longer."
                  : "Thinking…"}
              </p>
            ) : (
              <>
                {multi && (
                  <Button
                    size="lg"
                    disabled={!ticked.length}
                    onClick={() => send({ message: ticked.join(", ") })}
                    className="rounded-full px-6"
                  >
                    {ticked.length
                      ? `Continue with ${ticked.length}`
                      : "Pick as many as fit"}
                  </Button>
                )}
                {multi && ticked.length < step.options.length && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setTicked(() => [...step.options])}
                    className="rounded-full"
                  >
                    All of them
                  </Button>
                )}
                {step.can_delegate && step.field && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() =>
                      send({
                        message: DELEGATE_TEXT,
                        choice: {
                          field: step.field as string,
                          value: DELEGATE,
                        },
                      })
                    }
                    className="rounded-full text-[var(--sf-graphite)]"
                  >
                    You decide
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-[var(--sf-line)] bg-[var(--sf-paper)] px-5 py-3 sm:px-10">
        <AnswerBox
          className="mx-auto max-w-[1120px]"
          value={draft.text ?? typed}
          onChange={(update) =>
            onDraft((d) => ({ ...d, text: update(d.text ?? typed) }))
          }
          sending={sending}
          placeholder={
            live ? "Or type your own answer…" : "Or type a new answer…"
          }
          onSubmit={(text, spoken) => send({ message: text, spoken })}
        />
      </div>
    </div>
  );
}
