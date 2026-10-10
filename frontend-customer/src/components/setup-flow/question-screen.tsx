"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OPTION_ICONS } from "@/lib/option-icons";
import {
  addStarter,
  browserTimeZone,
  noteOf,
  pickedOptions,
  planLabel,
  scheduleSummary,
  scheduleValid,
  withNote,
  type QuestionStep,
} from "@/lib/interview";
import {
  DELEGATE,
  DELEGATE_TEXT,
  SKIP,
  isReview,
  type GuideCards,
  type LookCards,
  type ReviewKind,
  type ScheduleMode,
  type StepDraft,
  type TurnRequest,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { AnswerBox } from "./answer-box";
import { BuilderPreview, type BuilderData } from "./builder-preview";
import { DraftReview } from "./draft-review";
import { LookCardsView } from "./look-cards";
import { SchedulePicker } from "./schedule-picker";
import { SocialsPicker } from "./socials-picker";

export type { StepDraft };

/** One interview question on the whole screen: big answer tiles (any number
 * of them on a multi question), "You decide", or a typed or dictated answer.
 * Picking a tile or card only selects it; Continue sends. A question the
 * coach already answered shows their answer, ready to change (Continue with
 * it unchanged just moves on). Unsent ticks and text live in ``draft`` so
 * moving between questions keeps them. */
export function QuestionScreen({
  step,
  cards,
  brandName,
  host,
  live,
  sending,
  draft,
  builder,
  onDraft,
  onSend,
  onMoreLogos,
  onLogoMore,
  onCover,
  onNext,
  dir,
}: {
  step: QuestionStep;
  /** Look cards (style, logo) or the draft to review, if it is one. */
  cards?: GuideCards | null;
  brandName: string;
  /** The site's host, shown on the look preview's address bar. */
  host: string;
  /** The question being asked now, vs. one the coach went back to. */
  live: boolean;
  sending: boolean;
  draft: StepDraft;
  /** What a building question previews beside its answers. */
  builder?: BuilderData;
  onDraft: (update: (d: StepDraft) => StepDraft) => void;
  onSend: (req: TurnRequest) => void;
  /** Which way the slide came from: forward, or back to an earlier question. */
  dir: "next" | "back";
  onMoreLogos: (page: number) => Promise<LookCards>;
  onLogoMore: () => Promise<LookCards>;
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
  /** Move on to the next question without answering this one again. */
  onNext: () => void;
}) {
  const multi = !!step.multi && step.options.length > 1;
  const picked = pickedOptions(step);
  const ticked = draft.ticked ?? picked;
  const review = isReview(cards) ? cards : null;
  const looks = cards && !isReview(cards) ? cards : null;
  // A typed answer (not a tile, a card or "you decide") goes back in the
  // box, and so does the note sent with picked tiles.
  const typed =
    live || cards || !step.answer || step.answer === DELEGATE_TEXT
      ? ""
      : picked.length
        ? noteOf(step.answer)
        : step.answer;
  // What is in the box now: Continue sends it with the picks.
  const note = (draft.text ?? typed).trim();
  const changed =
    (draft.card
      ? draft.card.label !== step.answer
      : ticked.join("\n") !== picked.join("\n")) || note !== typed.trim();
  // A schedule question: the tile picks weekly or one-time, the picker the dates.
  const mode: ScheduleMode = ticked[0] === "One-time" ? "once" : "recurring";
  const sched = step.schedule ? (draft.schedule ?? {}) : null;
  // A social-accounts question: a handle or link for each network ticked.
  const none = !!step.alone && ticked.includes(step.alone);
  const networks = step.socials && !none ? ticked : [];
  const socials = step.socials ? (draft.socials ?? {}) : null;
  const canContinue = review
    ? !!note ||
      review.status === "waiting" ||
      (review.status === "ready" && !!review.item)
    : looks
      ? !!draft.card || (!live && !!step.answer)
      : sched
        ? ticked.length > 0 && scheduleValid(mode, sched)
        : socials
          ? ticked.length > 0 && networks.every((n) => !!socials[n]?.trim())
          : ticked.length > 0 || !!note;
  // A turn can take a while when the model is busy; say so honestly.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!sending) return;
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, [sending]);
  // After a pick, a slim bar keeps Continue in reach while the real button
  // is scrolled out of view. The answer box itself stays in the page
  // (51d5301b took it out of a sticky footer on purpose).
  const actions = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = actions.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setOffscreen(!e.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const pickedLabel =
    draft.card?.label ??
    (ticked.length > 1 ? `${ticked.length} picked` : ticked[0]);

  const send = (req: TurnRequest) => {
    if (sending) return;
    onSend(live || !step.field ? req : { ...req, field: step.field });
  };
  const setTicked = (next: (t: string[]) => string[]) =>
    onDraft((d) => ({ ...d, ticked: next(d.ticked ?? ticked) }));
  // Ticking the "alone" option ("Free for now") clears the rest, and the
  // other way round.
  const toggle = (o: string) =>
    setTicked((t) =>
      t.includes(o)
        ? t.filter((x) => x !== o)
        : o === step.alone
          ? [o]
          : [...t.filter((x) => x !== step.alone), o],
    );
  const every = step.options.filter((o) => o !== step.alone);
  // Continue (and Enter in the box) sends the picks together with the
  // coach's note. On a review screen the note is a change to the draft.
  const proceed = (spoken = false, words = note) => {
    const field = step.field;
    if (review && field) {
      if (words) return send({ message: words, spoken });
      return live
        ? send({ message: "Looks good", choice: { field, value: "ok" } })
        : onNext();
    }
    if (!live && !changed) return onNext();
    const pick: TurnRequest =
      sched && field
        ? {
            message: scheduleSummary(mode, sched),
            choice: {
              field,
              value: JSON.stringify({
                mode,
                ...sched,
                tz: sched.tz || browserTimeZone(),
              }),
            },
          }
        : socials && field
          ? {
              message: ticked.join(", "),
              choice: {
                field,
                value: JSON.stringify(
                  Object.fromEntries(
                    networks.map((n) => [n, socials[n].trim()]),
                  ),
                ),
              },
            }
          : draft.card && field
            ? {
                message: draft.card.label,
                choice: { field, value: draft.card.value },
              }
            : { message: ticked.join(", ") };
    send({ ...pick, message: withNote(pick.message, words), spoken });
  };
  // Slide choreography: the words of the question land one by one, then
  // the answers spring in.
  const words = step.question.split(/\s+/).filter(Boolean);
  const answersAt = 160 + Math.min(words.length, 16) * 42;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 py-8 sm:px-10">
        <div
          className={
            dir === "back"
              ? "motion-safe:animate-[sf-slide-back_.6s_var(--sf-spring)_.1s_both]"
              : "motion-safe:animate-[sf-slide-next_.6s_var(--sf-spring)_.1s_both]"
          }
        >
          <div
            className={cn(
              builder &&
                "lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-12",
            )}
          >
            {builder && step.builder && (
              <aside
                className="mb-8 lg:sticky lg:top-6 lg:mb-0 motion-safe:animate-[sf-rise_.6s_ease-out_both]"
                style={{ animationDelay: `${answersAt}ms` }}
              >
                <BuilderPreview
                  kind={step.builder}
                  data={builder}
                  brandName={brandName}
                  disabled={sending}
                  onCover={onCover}
                />
              </aside>
            )}
            <div className="min-w-0">
              {live ? (
                <>
                  {step.ack && (
                    <p className="max-w-[72ch] text-[16px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_both]">
                      {step.ack}
                    </p>
                  )}
                  {step.status && (
                    <p className="mt-2 flex max-w-[72ch] gap-2.5 text-[15px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_80ms_both]">
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
                step.answer !== typed && (
                  <p className="max-w-[72ch] text-[15px] text-[var(--sf-graphite)]">
                    You said:{" "}
                    <span className="text-[var(--sf-ink)]">{step.answer}</span>
                  </p>
                )
              )}
              <h1 className="mt-3 max-w-[32ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[42px]">
                {words.map((w, i) => (
                  <Fragment key={i}>
                    <span
                      className="inline-block motion-safe:animate-[sf-word_.8s_var(--sf-spring)_both]"
                      style={{
                        animationDelay: `${120 + Math.min(i, 16) * 42}ms`,
                      }}
                    >
                      {w}
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              {step.why && (
                <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
                  {step.why}
                </p>
              )}

              {review && (
                <DraftReview
                  card={review}
                  delay={answersAt}
                  disabled={sending}
                  onCover={onCover}
                  onRetry={() =>
                    send({ message: "Draft it again from scratch" })
                  }
                />
              )}

              {looks && step.field && (
                <LookCardsView
                  cards={looks}
                  brandName={brandName}
                  host={host}
                  selected={live ? undefined : step.answer?.split("\n")[0]}
                  chosen={draft.card?.value}
                  disabled={sending}
                  delay={answersAt}
                  onMore={onMoreLogos}
                  onKeep={() => proceed()}
                  onLogoMore={onLogoMore}
                  onPick={(value, label) =>
                    onDraft((d) => ({ ...d, card: { value, label } }))
                  }
                />
              )}

              {step.options.length > 0 && (
                <div
                  className={cn(
                    "mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3",
                    builder
                      ? "lg:grid-cols-3 xl:grid-cols-4"
                      : "lg:grid-cols-4",
                  )}
                >
                  {step.options.map((o, i) => {
                    const on = ticked.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={multi && !step.starter ? on : undefined}
                        disabled={sending}
                        onClick={() => {
                          if (!step.starter)
                            return multi ? toggle(o) : setTicked(() => [o]);
                          onDraft((d) => ({
                            ...d,
                            text: addStarter(d.text ?? typed, o),
                          }));
                          requestAnimationFrame(() =>
                            document.getElementById("setup-answer")?.focus(),
                          );
                        }}
                        style={{
                          animationDelay: `${answersAt + Math.min(i, 15) * 32}ms`,
                        }}
                        className={cn(
                          "relative flex min-h-[84px] flex-col justify-center gap-1.5 rounded-2xl border px-4 py-3.5 text-left text-[15.5px] font-medium leading-snug",
                          "transition-[background-color,border-color,box-shadow,transform] duration-200 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] disabled:pointer-events-none",
                          on
                            ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)] shadow-[0_10px_24px_-14px_rgb(34_33_31/0.6)]"
                            : "border-[var(--sf-line)] bg-white hover:border-[var(--sf-line-strong)] hover:shadow-[0_10px_24px_-16px_rgb(48_36_20/0.45)]",
                          sending && !on && "opacity-55",
                        )}
                      >
                        {(() => {
                          const Icon = step.icons?.[o]
                            ? OPTION_ICONS[step.icons[o]]
                            : undefined;
                          return (
                            Icon && (
                              <Icon
                                aria-hidden
                                className={cn(
                                  "size-5 shrink-0",
                                  on
                                    ? "text-[var(--sf-paper)]"
                                    : "text-[var(--sf-brass)]",
                                )}
                              />
                            )
                          );
                        })()}
                        <span className={cn("leading-snug", multi && "pr-7")}>
                          {o}
                        </span>
                        {step.hints?.[o] && (
                          <span
                            className={cn(
                              "text-[12.5px] font-normal leading-snug",
                              multi && "pr-7",
                              on ? "opacity-75" : "text-[var(--sf-graphite)]",
                            )}
                          >
                            {step.hints[o]}
                          </span>
                        )}
                        {step.details?.[o] && (
                          <span
                            className={cn(
                              "text-[12.5px] font-normal leading-snug",
                              multi && "pr-7",
                              on ? "opacity-80" : "text-[var(--sf-graphite)]",
                            )}
                          >
                            {step.details[o]}
                          </span>
                        )}
                        {step.plan?.options.includes(o) && (
                          <span
                            className={cn(
                              "mt-0.5 w-fit rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                              on
                                ? "bg-[rgb(255_255_255/0.15)]"
                                : "bg-[var(--sf-tint-strong)] text-[var(--sf-graphite)]",
                            )}
                          >
                            {planLabel(step.plan)}
                          </span>
                        )}
                        {multi && !step.starter && (
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

              {sched && ticked.length > 0 && (
                <SchedulePicker
                  key={mode}
                  mode={mode}
                  value={sched}
                  onChange={(s) => onDraft((d) => ({ ...d, schedule: s }))}
                  disabled={sending}
                  className="mt-4 motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
                />
              )}

              {socials && networks.length > 0 && (
                <SocialsPicker
                  networks={networks}
                  value={socials}
                  onChange={(s) => onDraft((d) => ({ ...d, socials: s }))}
                  disabled={sending}
                  className="mt-4 motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
                />
              )}

              <div
                ref={actions}
                className="mt-6 flex min-h-11 flex-wrap items-center gap-2"
              >
                {sending ? (
                  <p className="flex items-center gap-2 text-[15px] text-[var(--sf-graphite)]">
                    <Spinner size="sm" className="text-[var(--sf-brass)]" />
                    {slow
                      ? "Still thinking. Your site is being built at the same time, so this can take a little longer."
                      : "Thinking…"}
                  </p>
                ) : (
                  <>
                    {(cards || step.options.length > 0) && (
                      <Button
                        id="setup-continue"
                        size="lg"
                        disabled={!canContinue}
                        onClick={() => proceed()}
                        className="rounded-full px-6"
                      >
                        {review
                          ? note
                            ? "Send changes"
                            : review.status === "waiting"
                              ? "Continue"
                              : "Looks good, continue"
                          : !canContinue
                            ? multi
                              ? "Pick as many as fit"
                              : "Pick one to continue"
                            : !live && !changed
                              ? "Keep this answer"
                              : note && (ticked.length > 0 || draft.card)
                                ? "Continue with your note"
                                : multi && ticked.length > 1
                                  ? `Continue with ${ticked.length}`
                                  : "Continue"}
                      </Button>
                    )}
                    {multi &&
                      !step.starter &&
                      every.some((o) => !ticked.includes(o)) && (
                        <Button
                          variant="ghost"
                          size="lg"
                          onClick={() => setTicked(() => every)}
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
                    {step.skip && step.field && (
                      <Button
                        variant="ghost"
                        size="lg"
                        onClick={() =>
                          send({
                            message: step.skip as string,
                            choice: {
                              field: step.field as string,
                              value: SKIP,
                            },
                          })
                        }
                        className="rounded-full text-[var(--sf-graphite)]"
                      >
                        {step.skip}
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div style={{ viewTransitionName: "sf-answer" }} className="mt-6">
                <AnswerBox
                  className="max-w-[720px]"
                  value={draft.text ?? typed}
                  onChange={(update) =>
                    onDraft((d) => ({ ...d, text: update(d.text ?? typed) }))
                  }
                  sending={sending}
                  placeholder={
                    review
                      ? `Or tell me what to change, like ${
                          review.kind === "course"
                            ? "“make it six weeks”"
                            : "“make it an hour long”"
                        } or “another photo”…`
                      : live
                        ? "Or type your own answer…"
                        : "Or type a new answer…"
                  }
                  onSubmit={(text, spoken) =>
                    canContinue
                      ? proceed(spoken, text)
                      : send({ message: text, spoken })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {offscreen &&
        canContinue &&
        changed &&
        !sending &&
        !review &&
        pickedLabel && (
          <div className="sticky bottom-4 z-20 mx-auto mb-4 flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-[var(--sf-line)] bg-white/95 py-1.5 pl-5 pr-1.5 shadow-[0_10px_24px_-14px_rgb(34_33_31/0.6)] backdrop-blur motion-safe:animate-[sf-rise_.3s_ease-out_both]">
            <span className="truncate text-[14px] font-medium">
              {pickedLabel}
            </span>
            <Button
              size="sm"
              onClick={() => proceed()}
              className="shrink-0 rounded-full px-4"
            >
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
    </div>
  );
}
