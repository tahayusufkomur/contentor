"use client";

import type { ReactNode } from "react";
import {
  BookOpen,
  Check,
  MapPin,
  Newspaper,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { SpecialistFace } from "@/components/copilot/specialist-face";
import { SPECIALIST_KEYS } from "@/lib/copilot/team";
import type { Slide } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

// The picture's shape depends on the slide (backend interview_slides._picture);
// anything unexpected reads as empty rather than crashing the deck.
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const str = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

const CARD =
  "rounded-[14px] border border-[var(--sf-line)] bg-white p-3.5 min-w-0";
const MUTED = "text-[13px] leading-snug text-[var(--sf-graphite)]";

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

const WAYS: Record<string, { label: string; icon: LucideIcon }> = {
  course: { label: "Digital content", icon: BookOpen },
  live: { label: "Live session", icon: Video },
  onsite: { label: "In-person event", icon: MapPin },
  articles: { label: "Articles", icon: Newspaper },
  community: { label: "Community", icon: Users },
};

const PAY_WAYS: Record<string, string> = {
  course: "Buys a course",
  membership: "Joins a membership",
  class: "Pays per session",
};

function Team() {
  const t = useTranslations("admin");
  return (
    <Grid cols="sm:grid-cols-2 lg:grid-cols-3">
      {SPECIALIST_KEYS.map((k) => (
        <div key={k} className={cn(CARD, "flex items-start gap-3")}>
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

function Site({ picture }: { picture: Rec }) {
  const pages = Array.isArray(picture.pages) ? picture.pages.map(str) : [];
  return (
    <Grid cols="grid-cols-2 sm:grid-cols-4">
      {pages.map((name) => (
        <div key={name} className={CARD}>
          <Sketch />
          <div className="mt-2 text-[13.5px] font-semibold">{name}</div>
        </div>
      ))}
    </Grid>
  );
}

function Ways({ picture }: { picture: Rec }) {
  return (
    <Grid cols="sm:grid-cols-2 lg:grid-cols-5">
      {list(picture.items).map((item) => {
        const way = WAYS[str(item.way)];
        if (!way) return null;
        const Icon = way.icon;
        return (
          <div key={str(item.way)} className={CARD}>
            <span className="grid size-8 place-items-center rounded-full bg-[var(--sf-brass-soft)] text-[var(--sf-brass)]">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="mt-2.5 text-[15.5px] font-semibold">
              {way.label}
            </div>
            <div className={cn(MUTED, "mt-1")}>{str(item.example)}</div>
          </div>
        );
      })}
    </Grid>
  );
}

function Reach({
  picture,
  brandName,
  host,
}: {
  picture: Rec;
  brandName: string;
  host?: string;
}) {
  return (
    <div className={cn(CARD, "max-w-[560px]")}>
      {host && (
        <div className="truncate text-[12.5px] text-[var(--sf-faint)]">
          {host}
        </div>
      )}
      <div className="mt-0.5 text-[18px] font-medium leading-tight text-[var(--sf-brass)]">
        {str(picture.brand) || brandName}
      </div>
      <div className={cn(MUTED, "mt-1.5 text-[14px]")}>
        {str(picture.pitch)}
      </div>
    </div>
  );
}

function Look() {
  return (
    <Grid cols="sm:grid-cols-2">
      {[false, true].map((dark) => (
        <div key={String(dark)} className={CARD}>
          <Sketch dark={dark} />
          <div className="mt-2 text-[13.5px] font-semibold">
            {dark ? "Dark" : "Light"}
          </div>
        </div>
      ))}
    </Grid>
  );
}

function Pay({ picture }: { picture: Rec }) {
  return (
    <Grid cols="sm:grid-cols-3">
      {list(picture.students).map((s) => {
        const months = Array.isArray(s.months) ? s.months : [];
        return (
          <div key={str(s.name)} className={CARD}>
            <div className="flex items-center gap-2 text-[13px] text-[var(--sf-graphite)]">
              <span
                aria-hidden
                className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[12px] font-semibold text-[var(--sf-ink)]"
              >
                {str(s.name).charAt(0)}
              </span>
              <span className="min-w-0">
                {str(s.name)}, {str(s.about).toLowerCase()}
              </span>
            </div>
            <div className="mt-2.5 text-[15.5px] font-semibold">
              {PAY_WAYS[str(s.way)] ?? ""}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((i) => {
                const paid = str(months[i]);
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md px-1.5 py-1 text-center",
                      paid
                        ? "bg-[var(--sf-brass-soft)] text-[var(--sf-ink)]"
                        : "bg-[var(--sf-tint)] text-[var(--sf-faint)]",
                    )}
                  >
                    <div className="text-[10.5px] uppercase tracking-wide text-[var(--sf-graphite)]">
                      Month {i + 1}
                    </div>
                    <div className="text-[13px] font-semibold">
                      {paid || "–"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Grid>
  );
}

function Membership({ picture }: { picture: Rec }) {
  return (
    <Grid cols="sm:grid-cols-2">
      {list(picture.plans).map((p) => (
        <div key={str(p.name)} className={CARD}>
          <div className="text-[15.5px] font-semibold">{str(p.name)}</div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--sf-brass)]">
            {str(p.price)} a month
          </div>
          <div className={cn(MUTED, "mt-2")}>Covers: {str(p.covers)}</div>
        </div>
      ))}
    </Grid>
  );
}

const WAYS_IN = ["Free", "Sold on its own", "In a membership"];

function Access({ picture }: { picture: Rec }) {
  const ticked = Array.isArray(picture.ticked) ? picture.ticked.map(str) : [];
  return (
    <div className={cn(CARD, "max-w-[420px]")}>
      <div className="text-[15.5px] font-semibold">{str(picture.item)}</div>
      <div className={cn(MUTED, "mt-0.5")}>Who can open it</div>
      <ul className="mt-3 space-y-2">
        {[...WAYS_IN, ...ticked.filter((w) => !WAYS_IN.includes(w))].map(
          (way) => {
            const on = ticked.includes(way);
            return (
              <li key={way} className="flex items-center gap-2.5 text-[14px]">
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
          },
        )}
      </ul>
    </div>
  );
}

const COVER = {
  background:
    "linear-gradient(135deg, var(--sf-brass-soft), var(--sf-tint-strong))",
};

function Course({ picture }: { picture: Rec }) {
  const modules = Array.isArray(picture.modules)
    ? picture.modules.map(str)
    : [];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[14px] border border-[var(--sf-line)] bg-white">
        <div className="relative h-[110px]" style={COVER}>
          <span className="absolute bottom-2.5 left-3 rounded-md bg-white/90 px-2 py-0.5 text-[11.5px] font-semibold">
            Course
          </span>
        </div>
        <div className="px-3.5 py-3">
          <div className="text-[16px] font-semibold">{str(picture.title)}</div>
          <div className={cn(MUTED, "mt-1")}>
            {modules.length} modules · {str(picture.lessons)} lessons
          </div>
          <div className="mt-2.5 text-[14px] font-semibold">
            {str(picture.price)}
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {modules.map((m) => (
          <li
            key={m}
            className="rounded-xl bg-[var(--sf-tint)] px-3 py-2.5 text-[13.5px] leading-snug"
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

function Live({ picture }: { picture: Rec }) {
  return (
    <div className={cn(CARD, "flex max-w-[460px] items-center gap-3")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sf-brass-soft)] text-[var(--sf-brass)]">
        <Video className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold">{str(picture.title)}</div>
        <div className={MUTED}>{str(picture.when)}</div>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-[var(--sf-ink)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--sf-paper)]"
      >
        Join
      </span>
    </div>
  );
}

function Onsite({ picture }: { picture: Rec }) {
  return (
    <div className={cn(CARD, "max-w-[460px]")}>
      <div className="text-[15.5px] font-semibold">{str(picture.title)}</div>
      <div className={cn(MUTED, "mt-1.5 flex items-center gap-1.5")}>
        <MapPin className="size-3.5 text-[var(--sf-brass)]" aria-hidden />
        {str(picture.place)}
      </div>
    </div>
  );
}

function Inbox({ picture }: { picture: Rec }) {
  return (
    <div className={cn(CARD, "flex max-w-[560px] items-start gap-3")}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sf-tint)] text-[13px] font-semibold"
      >
        {str(picture.name).charAt(0)}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">{str(picture.name)}</div>
        <div className={cn(MUTED, "mt-0.5 text-[14px]")}>
          {str(picture.text)}
        </div>
      </div>
    </div>
  );
}

/** The picture under a slide's words, built from the coach's answers. An
 *  unknown key draws nothing. */
export function SlidePicture({
  slide,
  brandName = "",
  host,
}: {
  slide: Slide;
  brandName?: string;
  host?: string;
}) {
  const p = rec(slide.picture);
  switch (slide.key) {
    case "team":
      return <Team />;
    case "site":
      return <Site picture={p} />;
    case "ways":
      return <Ways picture={p} />;
    case "reach":
      return <Reach picture={p} brandName={brandName} host={host} />;
    case "look":
      return <Look />;
    case "pay":
      return <Pay picture={p} />;
    case "membership":
      return <Membership picture={p} />;
    case "access":
      return <Access picture={p} />;
    case "course":
      return <Course picture={p} />;
    case "live":
      return <Live picture={p} />;
    case "onsite":
      return <Onsite picture={p} />;
    case "inbox":
      return <Inbox picture={p} />;
    default:
      return null;
  }
}
