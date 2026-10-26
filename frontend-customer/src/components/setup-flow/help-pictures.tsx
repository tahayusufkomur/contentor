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
              {t(`team.specialists.${k}.name`)}
            </div>
            <div className={cn(MUTED, "mt-1")}>
              {t(`team.specialists.${k}.job`)}
            </div>
          </div>
        </div>
      ))}
    </Grid>
  );
}

function Site() {
  return (
    <Grid cols="grid-cols-2 sm:grid-cols-4">
      {["Home", "About", "Contact", "FAQ"].map((name, i) => (
        <div key={name} style={beat(i)} className={cn(CARD, WAVE)}>
          <Sketch />
          <div className="mt-2 text-[13.5px] font-semibold">{name}</div>
        </div>
      ))}
    </Grid>
  );
}

function Look() {
  return (
    <Grid cols="sm:grid-cols-2">
      {[false, true].map((dark, i) => (
        <div key={String(dark)} style={beat(i * 2)} className={cn(CARD, WAVE)}>
          <Sketch dark={dark} />
          <div className="mt-2 text-[13.5px] font-semibold">
            {dark ? "Dark" : "Light"}
          </div>
        </div>
      ))}
    </Grid>
  );
}

const STUDENTS = [
  {
    name: "Anna",
    about: "busy mum, short on time",
    way: "Buys a course",
    months: [49, null, null],
  },
  {
    name: "Ben",
    about: "comes every week",
    way: "Joins a membership",
    months: [19, 19, 19],
  },
  {
    name: "Cara",
    about: "drops in when she can",
    way: "Pays per session",
    months: [10, null, 10],
  },
];

function Pay({ sign }: { sign: string }) {
  return (
    <Grid cols="sm:grid-cols-3">
      {STUDENTS.map((s) => (
        <div key={s.name} className={CARD}>
          <div className="flex items-center gap-2 text-[13px] text-[var(--sf-graphite)]">
            <span
              aria-hidden
              className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[12px] font-semibold text-[var(--sf-ink)]"
            >
              {s.name.charAt(0)}
            </span>
            <span className="min-w-0">
              {s.name}, {s.about}
            </span>
          </div>
          <div className="mt-2.5 text-[15.5px] font-semibold">{s.way}</div>
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
                  Month {i + 1}
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
  { name: "The Club", price: 19, covers: "Every live session" },
  { name: "Course library", price: 12, covers: "Every course" },
];

function Membership({ sign }: { sign: string }) {
  return (
    <Grid cols="sm:grid-cols-2">
      {PLANS.map((p, i) => (
        <div key={p.name} style={beat(i)} className={cn(CARD, WAVE)}>
          <div className="text-[15.5px] font-semibold">{p.name}</div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--sf-brass)]">
            {sign}
            {p.price} a month
          </div>
          <div className={cn(MUTED, "mt-2")}>Covers: {p.covers}</div>
        </div>
      ))}
    </Grid>
  );
}

const WAYS_IN = ["Free", "Sold on its own", "In a membership"];
const TICKED = ["Sold on its own", "In a membership"];

function Access() {
  return (
    <div className={cn(CARD, "max-w-[420px]")}>
      <div className="text-[15.5px] font-semibold">Anything you make</div>
      <div className={cn(MUTED, "mt-0.5")}>Who can open it</div>
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
                {way}
                <span className="sr-only">
                  {on ? ", ticked" : ", not ticked"}
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
const MODULES = [
  "Week 1: The basics",
  "Week 2: Building the habit",
  "Week 3: Going further",
];

function Course({ sign }: { sign: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[14px] border border-[var(--sf-line)] bg-white">
        <div className="relative h-[110px]" style={COVER}>
          <span className="absolute bottom-2.5 left-3 rounded-md bg-white/90 px-2 py-0.5 text-[11.5px] font-semibold">
            Course
          </span>
        </div>
        <div className="px-3.5 py-3">
          <div className="text-[16px] font-semibold">The 6-week program</div>
          <div className={cn(MUTED, "mt-1")}>
            {MODULES.length} modules · 18 lessons
          </div>
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
            <b className="font-semibold">Module</b>
            <span className="text-[var(--sf-graphite)]"> · {m}</span>
          </li>
        ))}
        <li className="rounded-xl bg-[var(--sf-tint)] px-3 py-2.5 text-[13.5px] leading-snug text-[var(--sf-graphite)]">
          <b className="font-semibold text-[var(--sf-ink)]">Lessons</b> are the
          videos inside each module.
        </li>
      </ul>
    </div>
  );
}

function Live() {
  return (
    <div className={cn(CARD, "flex max-w-[460px] items-center gap-3")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sf-brass-soft)] text-[var(--sf-brass)]">
        <Video className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold">Tuesday evening class</div>
        <div className={MUTED}>Tuesdays, 7 pm</div>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-[var(--sf-ink)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--sf-paper)] motion-safe:animate-[sf-glow_2.4s_ease-in-out_infinite]"
      >
        Join
      </span>
    </div>
  );
}

function Inbox() {
  return (
    <div className={cn(CARD, "flex max-w-[560px] items-start gap-3", WAVE)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[13px] font-semibold"
      >
        A
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">Anna</div>
        <div className={cn(MUTED, "mt-0.5 text-[14px]")}>
          Hi! Is the Tuesday class OK for complete beginners?
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
