"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { SpecialistFace } from "@/components/copilot/specialist-face";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Spinner } from "@/components/ui/spinner";
import { demoSeen, markDemoSeen } from "@/lib/demo-seen";
import { OPTION_ICONS } from "@/lib/option-icons";
import {
  ADDRESS_BOXES,
  addressOk,
  browserTimeZone,
  CONTACT_DETAILS,
  idOf,
  contactOk,
  priceOk,
  defaultSchedule,
  noteOf,
  ownPicked,
  pickedOptions,
  prefilledPicks,
  scheduleSummary,
  scheduleValid,
  socialOk,
  starterStart,
  tileIcons,
  timeZones,
  withNote,
  type QuestionStep,
} from "@/lib/interview";
import {
  DELEGATE,
  DELEGATE_TEXT,
  SKIP,
  isReview,
  type QuestionCards,
  type LookCards,
  type ReviewKind,
  type ScheduleMode,
  type StepDraft,
  type TurnRequest,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { AnswerBox } from "./answer-box";
import { BuilderPreview, type BuilderData } from "./builder-preview";
import { DemoHint, StarterDemo } from "./demo-hint";
import { BusyOverlay } from "./busy-overlay";
import { DraftReview, NOUN } from "./draft-review";
import { LookCardsView } from "./look-cards";
import { OwnOptionCard } from "./own-option-card";
import { QuestionHelp } from "./question-help";
import { SchedulePicker } from "./schedule-picker";
import { SocialsPicker } from "./socials-picker";
import { StarterCard } from "./starter-card";
import { useLocale } from "next-intl";

export type { StepDraft };

/** One interview question on the whole screen: big answer tiles (any number
 * of them on a multi question), "Pick for me", or a typed or dictated answer.
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
  onCover,
  onTrial,
  onNext,
  dir,
}: {
  step: QuestionStep;
  /** Look cards (style, logo) or the draft to review, if it is one. */
  cards?: QuestionCards | null;
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
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
  /** Turn the first session's free trial on or off (a class's review). */
  onTrial?: (kind: ReviewKind, on: boolean) => Promise<unknown>;
  /** Move on to the next question without answering this one again. */
  onNext: () => void;
}) {
  const locale = useLocale();
  const multi = !!step.multi && step.options.length > 1;
  const prefill = live ? prefilledPicks(step) : { tiles: [], own: [] };
  // Own options: the ones sent with the answer, plus any added but not sent.
  const own =
    step.custom && multi
      ? (draft.custom ?? [...ownPicked(step), ...prefill.own])
      : [];
  const shown = [...step.options, ...own];
  const pastPicked = [...pickedOptions(step), ...ownPicked(step)];
  const picked = pastPicked.length
    ? pastPicked
    : [...prefill.tiles, ...prefill.own].filter((o) => shown.includes(o));
  const ticked = draft.ticked ?? picked;
  // A starter card's sentence: the coach's own once typed, else the starter
  // as it opens. A starter counts as finished only once the coach has
  // changed it (own options are complete as typed).
  const starts = draft.starts ?? {};
  const textOf = (o: string) =>
    starts[o] ?? (step.options.includes(o) ? starterStart(o) : o);
  const finished = (o: string) =>
    textOf(o).trim() !== "" &&
    (!step.options.includes(o) || textOf(o).trim() !== starterStart(o));
  const review = isReview(cards) ? cards : null;
  const looks = cards && !isReview(cards) ? cards : null;
  // A time-zone question: the browser's own zone, or the one picked before.
  const said = step.answer?.split("\n")[0] ?? "";
  const zoneWas =
    step.timezone && !live && said.includes("/") ? said : undefined;
  const zone = step.timezone
    ? (draft.zone ?? zoneWas ?? browserTimeZone())
    : null;
  // A typed answer (not a tile, a card, a picked zone or "you decide") goes
  // back in the box, and so does the note sent with picked tiles.
  const defaultTyped =
    live && !step.answer && !cards && !step.address
      ? (step.prefill_text ?? "")
      : "";
  const typed =
    live ||
    cards ||
    zoneWas ||
    step.address ||
    !step.answer ||
    step.answer === DELEGATE_TEXT
      ? defaultTyped
      : picked.length
        ? noteOf(step.answer)
        : step.answer;
  // What is in the box now: Continue sends it with the picks.
  const note = (draft.text ?? typed).trim();
  const changed =
    (draft.card
      ? draft.card.label !== step.answer
      : zone
        ? zone !== zoneWas
        : ticked.join("\n") !== picked.join("\n")) ||
    note !== typed.trim() ||
    !!draft.prices ||
    !!draft.details;
  // A schedule question: the tile picks weekly or one-time, the picker the dates.
  // (The tiles show in the creator's language: One-time is the second, whatever it reads.)
  const mode: ScheduleMode =
    idOf(ticked[0] ?? "", step.options, step.ids) === "One-time"
      ? "once"
      : "recurring";
  const sched = step.schedule
    ? (draft.schedule ?? defaultSchedule(mode))
    : null;
  // A social-accounts question: a handle or link for each network ticked.
  const none = !!step.alone && ticked.includes(step.alone);
  const networks = step.socials && !none ? ticked : [];
  const socials = step.socials ? (draft.socials ?? {}) : null;
  // A contact question: an email address or number for each way that needs
  // one. An address question: the place and its street address, no tiles.
  const ways = step.address
    ? ADDRESS_BOXES
    : step.contact
      ? ticked.filter((k) => idOf(k, step.options, step.ids) in CONTACT_DETAILS)
      : [];
  const details =
    step.contact || step.address
      ? { ...(step.prefill ?? {}), ...(draft.details ?? {}) }
      : null;
  const detailOk = (w: string, raw: string) =>
    step.address
      ? addressOk(raw)
      : contactOk(idOf(w, step.options, step.ids), raw);
  // A membership question: a monthly price for each tier ticked, hers to change.
  // A membership she named starts at the default own price, so a typed tile
  // and "Select all" never leave a price box empty.
  const prices =
    step.prices && Object.keys(step.prices).length
      ? {
          ...Object.fromEntries(
            own.map((o) => [o, String(step.own_price ?? "")]),
          ),
          ...Object.fromEntries(
            Object.entries(step.prices).map(([t, p]) => [t, String(p)]),
          ),
          ...(draft.prices ?? {}),
        }
      : null;
  const canContinue = review
    ? !!note ||
      review.status === "waiting" ||
      (review.status === "ready" && !!review.item)
    : looks
      ? !!draft.card || (!live && !!step.answer)
      : sched
        ? ticked.length > 0 && scheduleValid(mode, sched)
        : socials
          ? ticked.length > 0 &&
            networks.every((n) => socialOk(n, socials[n] ?? ""))
          : details
            ? (!!step.address || ticked.length > 0) &&
              ways.every((w) => detailOk(w, details[w] ?? ""))
            : prices
              ? ticked.length > 0 &&
                ticked.every((t) => priceOk(prices[t] ?? ""))
              : step.starter
                ? ticked.length > 0
                  ? ticked.every(finished)
                  : !!note
                : ticked.length > 0 || !!zone || !!note;
  // A turn can take a while when the model is busy; say so honestly.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!sending) return;
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, [sending]);
  // The "tap a sentence, then finish it" demo: plays until the coach touches
  // any card, and stays away on later starter questions once she has
  // finished a sentence (remembered in this browser).
  const [demoOk, setDemoOk] = useState(false);
  const learned = ticked.some((o) => step.options.includes(o) && finished(o));
  useEffect(() => {
    if (learned) markDemoSeen("starter");
    setDemoOk(!demoSeen("starter"));
  }, [learned, step.field]);
  const showDemo = !!step.starter && live && demoOk && ticked.length === 0;
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
    (ticked.length > 1
      ? `${ticked.length} picked`
      : step.starter
        ? textOf(ticked[0])
        : ticked[0]);

  // On a review a message (not the "Looks good" pick) is a change to the
  // draft: the card says so from the moment it is sent.
  const [changing, setChanging] = useState(false);
  const send = (req: TurnRequest) => {
    if (sending) return;
    if (review) setChanging(!req.choice);
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
  // A typed option is picked at once, and joins the tiles after the others.
  const addOwn = (labels: string[]) =>
    onDraft((d) => {
      const list = [...(d.custom ?? own)];
      let t = [...(d.ticked ?? ticked)];
      for (const label of labels) {
        const known = [...step.options, ...list].find(
          (o) => o.toLowerCase() === label.toLowerCase(),
        );
        if (!known) list.push(label);
        const name = known ?? label;
        if (!t.includes(name)) t = [...t.filter((x) => x !== step.alone), name];
      }
      return { ...d, custom: list, ticked: t };
    });
  const every = shown.filter((o) => o !== step.alone);
  const showIcons = tileIcons(step);
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
            message: scheduleSummary(mode, sched, locale),
            choice: {
              field,
              value: JSON.stringify({ mode, ...sched }),
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
          : prices && field
            ? {
                message: ticked.join(", "),
                choice: {
                  field,
                  value: JSON.stringify(
                    Object.fromEntries(
                      ticked.map((t) => [t, (prices[t] ?? "").trim()]),
                    ),
                  ),
                },
              }
            : details && field
              ? {
                  message: step.address
                    ? ways.map((w) => (details[w] ?? "").trim()).join(", ")
                    : ticked.join(", "),
                  choice: {
                    field,
                    value: JSON.stringify(
                      Object.fromEntries(
                        (step.address ? ways : ticked).map((w) => [
                          w,
                          (details[w] ?? "").trim(),
                        ]),
                      ),
                    ),
                  },
                }
              : draft.card && field
                ? {
                    message: draft.card.label,
                    choice: { field, value: draft.card.value },
                  }
                : zone && field
                  ? { message: zone, choice: { field, value: zone } }
                  : step.starter
                    ? {
                        message: ticked.map((o) => textOf(o).trim()).join(" "),
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
                      {step.status_by ? (
                        <span className="mt-[3px] shrink-0">
                          <SpecialistFace k={step.status_by} size="sm" />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--sf-brass)]"
                        />
                      )}
                      {step.status}
                    </p>
                  )}
                  {step.noted && step.noted.length > 0 && (
                    <p className="mt-2 flex max-w-[72ch] flex-wrap items-center gap-1.5 text-[13.5px] text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_120ms_both]">
                      <Check
                        aria-hidden
                        className="size-3.5 text-[var(--sf-brass)]"
                      />
                      Noted: {step.noted.join(" · ")}
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
              <QuestionHelp help={step.help} />

              {review && (
                <DraftReview
                  card={review}
                  delay={answersAt}
                  disabled={sending}
                  changing={sending && changing}
                  onCover={onCover}
                  onTrial={onTrial}
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
                  onPick={(value, label) =>
                    onDraft((d) => ({ ...d, card: { value, label } }))
                  }
                />
              )}
              {/* A look, logo or calendar picked: the grid is too tall for
                  the "Thinking…" line under it to be seen, so the wait
                  covers the screen. */}
              {looks && sending && (
                <ModalPortal>
                  <BusyOverlay
                    variant="screen"
                    message={
                      draft.card?.label
                        ? `Applying ${draft.card.label}…`
                        : "Applying your pick…"
                    }
                    hint={
                      slow
                        ? "Still working. Your site is being built at the same time, so this can take a little longer."
                        : "Your site updates while I get the next question ready."
                    }
                  />
                </ModalPortal>
              )}

              {step.starter && demoOk && (
                <DemoHint
                  show={showDemo}
                  caption="Tap a sentence, then finish it in your own words."
                >
                  <StarterDemo />
                </DemoHint>
              )}

              {shown.length > 0 && (
                <div
                  className={cn(
                    "mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3",
                    builder
                      ? "lg:grid-cols-3 xl:grid-cols-4"
                      : "lg:grid-cols-4",
                  )}
                >
                  {shown.map((o, i) => {
                    const on = ticked.includes(o);
                    if (step.starter)
                      return (
                        <StarterCard
                          key={o}
                          starter={o}
                          text={textOf(o)}
                          selected={on}
                          finished={finished(o)}
                          disabled={sending}
                          delay={answersAt + Math.min(i, 15) * 32}
                          onToggle={() => toggle(o)}
                          onEdit={(text) =>
                            onDraft((d) => ({
                              ...d,
                              starts: { ...(d.starts ?? {}), [o]: text },
                            }))
                          }
                        />
                      );
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={multi ? on : undefined}
                        disabled={sending}
                        onClick={() =>
                          multi ? toggle(o) : setTicked(() => [o])
                        }
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
                          const Icon =
                            showIcons && step.icons?.[o]
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
                  {multi && step.custom && (
                    <OwnOptionCard
                      key={step.field}
                      disabled={sending}
                      delay={answersAt + Math.min(shown.length, 15) * 32}
                      sentence={step.starter}
                      placeholder={prices ? "Name your own…" : undefined}
                      onAdd={addOwn}
                    />
                  )}
                </div>
              )}

              {zone && (
                <select
                  aria-label="Time zone"
                  value={zone}
                  disabled={sending}
                  onChange={(e) =>
                    onDraft((d) => ({ ...d, zone: e.target.value }))
                  }
                  className="mt-8 h-12 w-full max-w-[420px] rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 text-[15.5px] font-medium text-[var(--sf-ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
                  style={{ animationDelay: `${answersAt}ms` }}
                >
                  {timeZones(zone).map((z) => (
                    <option key={z} value={z}>
                      {z.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              )}

              {sched && ticked.length > 0 && (
                <SchedulePicker
                  key={mode}
                  mode={mode}
                  value={sched}
                  zone={builder?.answers.timezone}
                  onChange={(s) => onDraft((d) => ({ ...d, schedule: s }))}
                  disabled={sending}
                  className="mt-4 motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
                />
              )}

              {details && ways.length > 0 && (
                <SocialsPicker
                  networks={ways}
                  value={details}
                  onChange={(v) => onDraft((d) => ({ ...d, details: v }))}
                  disabled={sending}
                  placeholder={(w) =>
                    step.address
                      ? w === "Place"
                        ? "Studio Lumen, Kreuzberg"
                        : "Hauptstraße 12, 10827 Berlin"
                      : CONTACT_DETAILS[idOf(w, step.options, step.ids)] ===
                          "email"
                        ? "you@example.com"
                        : "+49 170 1234567"
                  }
                  ok={detailOk}
                  problem={(w) =>
                    step.address
                      ? w === "Place"
                        ? "Add the name of the place."
                        : "Add the street address."
                      : CONTACT_DETAILS[idOf(w, step.options, step.ids)] ===
                          "email"
                        ? "That doesn’t look like an email address."
                        : "Add the number with its country code, like +49 170 1234567."
                  }
                  reads={() => null}
                  className="mt-4 motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
                />
              )}

              {prices && ticked.length > 0 && (
                <SocialsPicker
                  networks={ticked}
                  value={prices}
                  onChange={(v) => onDraft((d) => ({ ...d, prices: v }))}
                  disabled={sending}
                  placeholder={() => `${step.sign ?? ""} a month`}
                  ok={(_t, raw) => priceOk(raw)}
                  problem={() => "Add a monthly price, like 19."}
                  reads={(_t, raw) =>
                    priceOk(raw)
                      ? `${step.sign ?? ""}${raw.trim()} a month`
                      : null
                  }
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
                      : review && changing
                        ? "Reading your changes…"
                        : "Thinking…"}
                  </p>
                ) : (
                  <>
                    {(cards ||
                      step.options.length > 0 ||
                      zone ||
                      step.address) && (
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
                            ? step.starter && ticked.length > 0
                              ? "Finish your sentence"
                              : prices && ticked.length > 0
                                ? "Add a price for each"
                                : multi
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
                    {/* The button waits for the rewrite: say what for. */}
                    {review?.status === "building" && review.item && !note && (
                      <p className="flex items-center gap-2 text-[14px] text-[var(--sf-graphite)]">
                        <Spinner
                          aria-hidden
                          size="sm"
                          className="text-[var(--sf-brass)]"
                        />
                        Rewriting your {NOUN[review.kind]}…
                      </p>
                    )}
                    {/* On every question that takes several answers (starter
                        cards are picked one by one, not all at once). */}
                    {multi && !step.starter && every.length > 0 && (
                      <Button
                        variant="ghost"
                        size="lg"
                        onClick={() =>
                          setTicked((t) =>
                            every.every((o) => t.includes(o)) ? [] : every,
                          )
                        }
                        className="rounded-full"
                      >
                        {every.every((o) => ticked.includes(o))
                          ? "Deselect all"
                          : "Select all"}
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
                        aria-describedby="setup-pick-for-me"
                        className="rounded-full text-[var(--sf-graphite)]"
                      >
                        Pick for me
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
              {step.can_delegate && step.field && !sending && (
                <p
                  id="setup-pick-for-me"
                  className="mt-2 text-[13px] text-[var(--sf-faint)]"
                >
                  Not sure? I&rsquo;ll choose from your answers.
                </p>
              )}
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
              <p className="mt-4 text-[13px] text-[var(--sf-faint)]">
                Nothing here is final. You can change all of it later from your
                dashboard.
              </p>
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
