"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { SpecialistFace } from "@/components/copilot/specialist-face";
import { SPECIALIST_KEYS } from "@/lib/copilot/team";
import { cn } from "@/lib/utils";

// Small drawings a question's ⓘ opens (backend interview_brief.Help.picture).
// Each one shows field-neutral sample content; only the currency sign is hers.
// They loop gently under `motion-safe:` (sf-help-wave, tokens.ts): each repeated
// part lights up in turn. Reduced motion gets the still, fully drawn picture.

const CARD =
  "rounded-[14px] border border-[var(--sf-line)] bg-white p-3.5 min-w-0";
const MUTED = "text-[13px] leading-snug text-[var(--sf-graphite)]";
const WAVE = "motion-safe:animate-[sf-help-wave_6s_ease-in-out_infinite]";
/** The i-th repeated part of a drawing starts its loop a beat after the last. */
const beat = (i: number): CSSProperties => ({ animationDelay: `${i * 0.45}s` });

function Grid({ cols, children }: { cols: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-3", cols)}>{children}</div>;
}

/** A page drawn as grey bars: nothing is built yet, so nothing is real. */
function Sketch({ dark = false }: { dark?: boolean }) {
  const bar = dark ? "bg-white/25" : "bg-[var(--sf-line-strong)]";
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-24 flex-col gap-1.5 rounded-lg border p-2",
        dark
          ? "border-[var(--sf-ink)] bg-[var(--sf-ink)]"
          : "border-[var(--sf-line)] bg-[var(--sf-tint)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("h-1.5 w-8 rounded-full", bar)} />
        <span className={cn("h-1.5 w-12 rounded-full", bar)} />
      </div>
      <span
        className={cn(
          "mt-1 h-2.5 w-2/3 rounded-full",
          dark ? "bg-[var(--sf-brass-soft)]" : "bg-[var(--sf-ink)]",
        )}
      />
      <span className={cn("h-1.5 w-1/2 rounded-full", bar)} />
      <span
        className={cn(
          "mt-auto h-6 rounded",
          dark ? "bg-white/15" : "bg-[var(--sf-brass-soft)]",
        )}
      />
    </div>
  );
}

function Team() {
  const t = useTranslations("admin");
  return (
    <Grid cols="sm:grid-cols-2 lg:grid-cols-3">
      {SPECIALIST_KEYS.map((k, i) => (
        <div
          key={k}
          style={beat(i)}
          className={cn(CARD, "flex items-start gap-3", WAVE)}
        >
          <SpecialistFace k={k} />
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold leading-tight">
              {t(`team.specialists.${k}.name` as never)}
            </div>
            <div className={cn(MUTED, "mt-1")}>
              {t(`team.specialists.${k}.job` as never)}
            </div>
          </div>
        </div>
      ))}
    </Grid>
  );
}

function Site() {
  const t = useTranslations("admin.setupFlow");
  return (
    <Grid cols="grid-cols-2 sm:grid-cols-4">
      {["home", "about", "contact", "faq"].map((name, i) => (
        <div key={name} style={beat(i)} className={cn(CARD, WAVE)}>
          <Sketch />
          <div className="mt-2 text-[13.5px] font-semibold">
            {t(`page.name.${name}` as never)}
          </div>
        </div>
      ))}
    </Grid>
  );
}

function Look() {
  const t = useTranslations("admin.setupFlow");
  return (
    <Grid cols="sm:grid-cols-2">
      {[false, true].map((dark, i) => (
        <div key={String(dark)} style={beat(i * 2)} className={cn(CARD, WAVE)}>
          <Sketch dark={dark} />
          <div className="mt-2 text-[13.5px] font-semibold">
            {dark ? t("help.look.dark") : t("help.look.light")}
          </div>
        </div>
      ))}
    </Grid>
  );
}

const STUDENTS = [
  { key: "anna", way: "course", months: [49, null, null] },
  { key: "ben", way: "membership", months: [19, 19, 19] },
  { key: "cara", way: "session", months: [10, null, 10] },
];

function Pay({ sign }: { sign: string }) {
  const t = useTranslations("admin.setupFlow");
  return (
    <Grid cols="sm:grid-cols-3">
      {STUDENTS.map((s) => (
        <div key={s.key} className={CARD}>
          <div className="flex items-center gap-2 text-[13px] text-[var(--sf-graphite)]">
            <span
              aria-hidden
              className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[12px] font-semibold text-[var(--sf-ink)]"
            >
              {t(`help.pay.${s.key}` as never).charAt(0)}
            </span>
            <span className="min-w-0">{t(`help.pay.${s.key}` as never)}</span>
          </div>
          <div className="mt-2.5 text-[15.5px] font-semibold">
            {t(`help.pay.${s.way}` as never)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {s.months.map((paid, i) => (
              <div
                key={i}
                style={beat(i)}
                className={cn(
                  "rounded-md px-1.5 py-1 text-center",
                  paid
                    ? cn("bg-[var(--sf-brass-soft)] text-[var(--sf-ink)]", WAVE)
                    : "bg-[var(--sf-tint)] text-[var(--sf-faint)]",
                )}
              >
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--sf-graphite)]">
                  {t("help.pay.month", { n: i + 1 })}
                </div>
                <div className="text-[13px] font-semibold">
                  {paid ? `${sign}${paid}` : "–"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Grid>
  );
}

const PLANS = [
  { key: "club", price: 19, covers: "coversLive" },
  { key: "library", price: 12, covers: "coversCourses" },
];

function Membership({ sign }: { sign: string }) {
  const t = useTranslations("admin.setupFlow");
  return (
    <Grid cols="sm:grid-cols-2">
      {PLANS.map((p, i) => (
        <div key={p.key} style={beat(i)} className={cn(CARD, WAVE)}>
          <div className="text-[15.5px] font-semibold">
            {t(`help.membership.${p.key}` as never)}
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--sf-brass)]">
            {t("help.membership.price", { sign, price: p.price })}
          </div>
          <div className={cn(MUTED, "mt-2")}>
            {t(`help.membership.${p.covers}` as never)}
          </div>
        </div>
      ))}
    </Grid>
  );
}

const WAYS_IN = ["free", "sold", "member"];
const TICKED = ["sold", "member"];

function Access() {
  const t = useTranslations("admin.setupFlow");
  return (
    <div className={cn(CARD, "max-w-[420px]")}>
      <div className="text-[15.5px] font-semibold">
        {t("help.access.title")}
      </div>
      <div className={cn(MUTED, "mt-0.5")}>{t("help.access.who")}</div>
      <ul className="mt-3 space-y-2">
        {WAYS_IN.map((way, i) => {
          const on = TICKED.includes(way);
          return (
            <li
              key={way}
              style={beat(i)}
              className={cn(
                "flex items-center gap-2.5 text-[14px]",
                on && WAVE,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-[18px] place-items-center rounded border",
                  on
                    ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                    : "border-[var(--sf-line-strong)] bg-white",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={on ? "" : "text-[var(--sf-graphite)]"}>
                {t(`help.access.${way}` as never)}
                <span className="sr-only">
                  {on ? t("help.access.ticked") : t("help.access.notTicked")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const COVER = {
  background:
    "linear-gradient(135deg, var(--sf-brass-soft), var(--sf-tint-strong))",
};
const MODULES = ["week1", "week2", "week3"];

function Course({ sign }: { sign: string }) {
  const t = useTranslations("admin.setupFlow");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[14px] border border-[var(--sf-line)] bg-white">
        <div className="relative h-[110px]" style={COVER}>
          <span className="absolute bottom-2.5 left-3 rounded-md bg-white/90 px-2 py-0.5 text-[11.5px] font-semibold">
            {t("help.course.label")}
          </span>
        </div>
        <div className="px-3.5 py-3">
          <div className="text-[16px] font-semibold">
            {t("help.course.title")}
          </div>
          <div className={cn(MUTED, "mt-1")}>{t("help.course.stats")}</div>
          <div className="mt-2.5 text-[14px] font-semibold">{sign}49</div>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {MODULES.map((m, i) => (
          <li
            key={m}
            style={beat(i)}
            className={cn(
              "rounded-xl bg-[var(--sf-tint)] px-3 py-2.5 text-[13.5px] leading-snug",
              WAVE,
            )}
          >
            {t.rich("help.course.module", {
              title: t(`help.course.${m}` as never),
              b: (chunks) => <b className="font-semibold">{chunks}</b>,
            })}
          </li>
        ))}
        <li className="rounded-xl bg-[var(--sf-tint)] px-3 py-2.5 text-[13.5px] leading-snug text-[var(--sf-graphite)]">
          {t.rich("help.course.lessons", {
            b: (chunks) => (
              <b className="font-semibold text-[var(--sf-ink)]">{chunks}</b>
            ),
          })}
        </li>
      </ul>
    </div>
  );
}

function Live() {
  const t = useTranslations("admin.setupFlow");
  return (
    <div className={cn(CARD, "flex max-w-[460px] items-center gap-3")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sf-brass-soft)] text-[var(--sf-brass)]">
        <Video className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold">
          {t("help.live.title")}
        </div>
        <div className={MUTED}>{t("help.live.when")}</div>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-[var(--sf-ink)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--sf-paper)] motion-safe:animate-[sf-glow_2.4s_ease-in-out_infinite]"
      >
        {t("help.live.join")}
      </span>
    </div>
  );
}

function Inbox() {
  const t = useTranslations("admin.setupFlow");
  return (
    <div className={cn(CARD, "flex max-w-[560px] items-start gap-3", WAVE)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[13px] font-semibold"
      >
        {t("help.inbox.name").charAt(0)}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">
          {t("help.inbox.name")}
        </div>
        <div className={cn(MUTED, "mt-0.5 text-[14px]")}>
          {t("help.inbox.message")}
        </div>
      </div>
    </div>
  );
}

/** The drawing a question's help names (backend ``Help.picture``), with her
 *  currency ``sign`` on the prices. An unknown name draws nothing. */
export function HelpPicture({ kind, sign }: { kind: string; sign: string }) {
  switch (kind) {
    case "team":
      return <Team />;
    case "site":
      return <Site />;
    case "look":
      return <Look />;
    case "pay":
      return <Pay sign={sign} />;
    case "membership":
      return <Membership sign={sign} />;
    case "access":
      return <Access />;
    case "course":
      return <Course sign={sign} />;
    case "live":
      return <Live />;
    case "inbox":
      return <Inbox />;
    default:
      return null;
  }
}
