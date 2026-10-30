// Pure helpers for the /setup interview (only pure imports: unit-tested in isolation).
import { formatDayMonth } from "@/lib/format";
import type {
  GuideTurn,
  InterviewEntry,
  Schedule,
  ScheduleMode,
  ScheduleSlot,
  T,
} from "@/lib/setup-flow";

/** Append a dictated phrase to what is already in the box. */
export function joinSpeech(base: string, phrase: string): string {
  const p = phrase.trim();
  if (!p) return base;
  const b = base.trimEnd();
  return b ? `${b} ${p}` : p;
}

type Builds = Record<string, { status: string; stage?: string } | undefined>;
type Drafts = Partial<Record<string, string>>;

/** The page whose build just finished between two polls, if any. */
export function landedPage(prev: Builds, next: Builds): string | null {
  return (
    Object.keys(next).find(
      (k) => next[k]?.status === "ready" && prev[k]?.status !== "ready",
    ) ?? null
  );
}

// The helpers below stay pure by taking the setup flow's translator (`T`) as
// an argument. Each message names a page or a draft by its key and owns the
// noun, so no language glues a nominative label into a sentence.

/** A built page of the site, looked over with the coach before going live. */
export interface ReviewPage {
  key: string;
  path: string;
  /** She approved it. */
  ok: boolean;
  /** Still being built: nothing to approve yet. */
  building: boolean;
}

/** The pages built for the site, in menu order (a page never built is not
 * part of it), each marked once she approved it. */
export function reviewPages(
  steps: { kind: string; page_key?: string; preview_path: string | null }[],
  builds: Builds,
  approved: string[],
): ReviewPage[] {
  return steps.flatMap((s) => {
    const status = s.page_key ? builds[s.page_key]?.status : undefined;
    if (s.kind !== "page" || !s.page_key || !s.preview_path) return [];
    if (!status || status === "idle") return [];
    return [
      {
        key: s.page_key,
        path: s.preview_path,
        ok: approved.includes(s.page_key),
        building: status === "building",
      },
    ];
  });
}

/** The next page still to approve after ``from``, wrapping round. */
export function nextToReview(
  pages: ReviewPage[],
  from?: string,
): ReviewPage | undefined {
  const at = pages.findIndex((p) => p.key === from);
  return [...pages.slice(at + 1), ...pages.slice(0, at + 1)].find((p) => !p.ok);
}

/** A running build's server-reported stage → its index in the overlay's
 * three steps (no stage yet = still planning). */
export function stageIndex(stage?: string): number {
  return stage === "photos" ? 2 : stage === "copy" ? 1 : 0;
}

/** What the guide is working on right now, or null when nothing is. */
export function activityLine(
  builds: Builds,
  drafts: Drafts,
  t: T,
): string | null {
  const items = [
    ...Object.keys(builds)
      .filter((k) => builds[k]?.status === "building")
      .map((k) =>
        t("activity.building", {
          page: k,
          stage: t(
            `activity.stage.${["planning", "copy", "photos"][stageIndex(builds[k]?.stage)]}`,
          ),
        }),
      ),
    ...Object.keys(drafts)
      .filter((k) => drafts[k] === "building")
      .map((k) => t("activity.drafting", { kind: k })),
  ];
  if (!items.length) return null;
  return items.length > 1
    ? t("activity.more", { first: items[0], count: items.length - 1 })
    : items[0];
}

const DRAFT_DONE = ["course", "event", "onsite", "post"];

/** What the guide says about work that finished between two polls. */
export function finishedNotes(
  prev: { builds: Builds; drafts: Drafts },
  next: { builds: Builds; drafts: Drafts },
  t: T,
): string[] {
  const notes: string[] = [];
  for (const k of Object.keys(next.builds)) {
    const was = prev.builds[k]?.status;
    const now = next.builds[k]?.status;
    if (now === "ready" && was !== "ready") {
      notes.push(
        k === "home" ? t("notes.homeReady") : t("notes.pageReady", { page: k }),
      );
    } else if (now === "failed" && was === "building") {
      notes.push(t("notes.pageFailed", { page: k }));
    }
  }
  for (const k of Object.keys(next.drafts)) {
    const was = prev.drafts[k];
    const now = next.drafts[k];
    if (now === "ready" && was !== "ready" && DRAFT_DONE.includes(k)) {
      notes.push(t(`notes.draftDone.${k}`));
    } else if (now === "failed" && was === "building") {
      notes.push(t("notes.draftFailed", { kind: k }));
    }
  }
  return notes;
}

// Mirrors interview_brief.SOCIALS / social_url (pinned by the same table in
// test_interview_brief.py): a handle, or a link on that network's own site.
// Per network: the hosts it answers to, and where a handle's profile lives.
const SOCIALS: Record<string, [hosts: string, profile: string]> = {
  instagram: ["instagram\\.com", "instagram.com/"],
  youtube: ["youtube\\.com|youtu\\.be", "youtube.com/@"],
  tiktok: ["tiktok\\.com", "tiktok.com/@"],
  facebook: ["facebook\\.com|fb\\.com", "facebook.com/"],
  x: ["x\\.com|twitter\\.com", "x.com/"],
  linkedin: ["linkedin\\.com", "linkedin.com/in/"],
};
// A bare site ("facebook.com") is not a handle on any network.
const SITE = /^(?:www\.)?[\w-]+\.(?:com|net|org|io|co|me|tv|be|app)$/i;

/** Where a network's profiles live: "instagram.com/". */
export const socialSite = (network: string): string =>
  SOCIALS[network.toLowerCase()]?.[1] ?? "";

/** The profile a handle or link means on a network ("instagram.com/mira"),
 * or null when the server will not take it: a link to another site, a site
 * with no profile after it, or words with spaces. */
export function socialLink(network: string, raw: string): string | null {
  const known = SOCIALS[network.toLowerCase()];
  const text = raw.trim().replace(/[.,;]+$/, "");
  if (!known || !text) return null;
  const [hosts, profile] = known;
  if (
    new RegExp(
      `^(?:https?://)?(?:[\\w-]+\\.)?(?:${hosts})/\\S{1,200}$`,
      "i",
    ).test(text)
  )
    return text.replace(/^https?:\/\//i, "");
  if (SITE.test(text) || !/^@?[\p{L}\p{N}_.-]{1,60}$/u.test(text)) return null;
  return profile + text.replace(/^@/, "");
}

/** Whether the server will take this handle or link for a network ("Instagram"). */
export const socialOk = (network: string, raw: string): boolean =>
  socialLink(network, raw) !== null;

/** What a tile stands for in code (the guide's `ids`, in the order of `options`): the tile's words are in the
 * creator's language, so a contact way, "One-time" or a way into an item is read from its identity. */
export const idOf = (label: string, options: string[], ids?: string[]) =>
  ids?.[options.indexOf(label)] ?? label;

/** Tiles joined in an answer ("Jeder, der den Kurs kauft, Premium"), as their identities. Longest label first,
 * because a label can hold a comma. Text that is no tile stays as it is. */
export function idsOfText(
  text: string,
  options: string[],
  ids?: string[],
): string[] {
  const out: string[] = [];
  let rest = text.trim();
  const known = options
    .map((o, i) => [o, ids?.[i] ?? o] as const)
    .sort((a, b) => b[0].length - a[0].length);
  while (rest) {
    const hit = known.find(
      ([label]) =>
        rest.startsWith(label) &&
        (rest.length === label.length || rest[label.length] === ","),
    );
    const cut = hit
      ? hit[0].length
      : (rest.indexOf(",") + 1 || rest.length + 1) - 1;
    const part = hit ? hit[1] : rest.slice(0, cut).trim();
    if (part) out.push(part);
    rest = rest.slice(cut).replace(/^,\s*/, "");
  }
  return out;
}

/** Contact ways that need a detail, as interview_brief.CONTACT_DETAILS (keyed by the way's identity). */
export const CONTACT_DETAILS: Record<string, "email" | "phone"> = {
  Email: "email",
  WhatsApp: "phone",
  Phone: "phone",
};

/** Whether the server will take this detail for a contact way: an email
 * address, or a phone number of 6 to 15 digits (contact_detail_ok). Ways
 * without a detail always pass. */
export function contactOk(way: string, raw: string): boolean {
  const kind = CONTACT_DETAILS[way];
  const text = raw.trim();
  if (!kind) return true;
  if (kind === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text);
  const digits = text.replace(/[\s().-]/g, "").replace(/^\+/, "");
  return /^\d{6,15}$/.test(digits);
}

/** The boxes of the address question, as interview_milestones.choose reads them. */
export const ADDRESS_BOXES = ["Place", "Address"];

/** Whether an address box is filled in enough to send. */
export const addressOk = (raw: string): boolean => raw.trim().length >= 3;

/** Whether the server will take this as a monthly price: its first number
 * (parse_price), above 0 and at most 9999. */
/** The ways into a course or class ticked on its "who can open it" question
 * (the tiles of interview_brief.access_options), and what its price badge
 * says for them: null when it is sold on its own, at its price. */
export function waysIn(answer: string | undefined): string[] {
  return (answer ?? "").split("\n")[0].split(", ").filter(Boolean);
}
export function accessBadge(ways: string[]): "free" | "members" | null {
  if (!ways.length || ways.some((w) => w.startsWith("Anyone who ")))
    return null;
  return ways.includes("Free for everyone") ? "free" : "members";
}

export function priceOk(raw: string): boolean {
  const n = Number(raw.match(/\d+(?:[.,]\d{1,2})?/)?.[0]?.replace(",", "."));
  return n > 0 && n <= 9999;
}

export function formatPrice(
  cents: number | null,
  currency: string,
  locale: string,
): string {
  if (cents == null) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export interface QuestionStep extends GuideTurn {
  /** What the coach answered (questions behind them only). */
  answer?: string;
}

/** The interview as a list of questions: each field the coach answered,
 * once, in the order they first answered it, with its latest wording and
 * answer; then the live question. */
export function questionSteps(
  entries: InterviewEntry[],
  guide: GuideTurn,
): QuestionStep[] {
  const asked = new Map<string, QuestionStep>();
  const order: string[] = [];
  let onScreen: string | null = null;
  for (const e of entries) {
    if (e.role === "guide") {
      if (e.field && e.question) {
        const {
          ack,
          question,
          options,
          ids,
          field,
          can_delegate,
          multi,
          custom,
          alone,
          icons,
          hints,
          skip,
          details,
          builder,
          schedule,
          socials,
          address,
          starter,
          why,
          help,
          contact,
          prefill,
          prefill_text,
          prefill_options,
          timezone,
          prices,
          sign,
        } = e;
        const answer = asked.get(e.field)?.answer;
        asked.set(e.field, {
          ack,
          question,
          options,
          ids,
          field,
          can_delegate,
          multi,
          custom,
          alone,
          icons,
          hints,
          skip,
          details,
          builder,
          schedule,
          socials,
          address,
          starter,
          why,
          help,
          contact,
          prefill,
          prefill_text,
          prefill_options,
          timezone,
          prices,
          sign,
          answer,
        });
        onScreen = e.field;
      }
      continue;
    }
    const field = e.field ?? onScreen;
    const step = field ? asked.get(field) : undefined;
    if (!field || !step) continue;
    step.answer = e.text;
    if (!order.includes(field)) order.push(field);
  }
  const past = order
    .filter((f) => f !== guide.field)
    .map((f) => asked.get(f) as QuestionStep);
  return guide.field ? [...past, guide] : past;
}

/** The interview in sections, in the order it asks them: progress reads by
 * section, so it never jumps the way a question count did. `key` names the
 * section's label in the messages (`section.<key>`). */
export const SECTIONS: { key: string; fields: string[] }[] = [
  {
    key: "you",
    fields: ["bio", "site_name", "teaches", "specialty", "discipline_focus"],
  },
  { key: "students", fields: ["audience", "outcome"] },
  { key: "offer", fields: ["offers", "teachers", "pitch", "difference"] },
  {
    key: "look",
    fields: ["tone", "site_style", "story", "credentials", "site_logo"],
  },
  {
    key: "pricing",
    fields: [
      "timezone",
      "currency",
      "payments",
      "memberships",
      "course_topic",
      "course_access",
      "course_price",
      "course_review",
      "live_topic",
      "live_when",
      "event_access",
      "event_price",
      "event_review",
      "onsite_topic",
      "onsite_when",
      "location",
      "onsite_access",
      "onsite_price",
      "onsite_review",
      "calendar_view",
      "article_topic",
    ],
  },
  { key: "contact", fields: ["socials", "contact"] },
  { key: "emails", fields: ["email_style"] },
  { key: "header", fields: ["navbar_layout", "footer_layout"] },
];

/** A question's section (SECTIONS.length once nothing is left to ask). */
export function sectionOf(field: string | null | undefined): number {
  if (!field) return SECTIONS.length;
  const i = SECTIONS.findIndex((s) => s.fields.includes(field));
  return i < 0 ? 0 : i;
}

/** Whether a question's tiles show icons: only when every tile has one and
 * they differ. One icon repeated on every tile says nothing, and a few
 * missing ones make the grid look uneven. */
export function tileIcons(step: GuideTurn): boolean {
  const icons = step.options.map((o) => step.icons?.[o]);
  return icons.length > 1 && icons.every(Boolean) && new Set(icons).size > 1;
}

/** A sentence starter as its card opens it: without the trailing "…", so
 * the coach finishes the sentence in the card. */
export const starterStart = (starter: string): string =>
  starter.replace(/\s*(…|\.\.\.)$/, "").trim();

/** A picked answer sent with the coach's own words: the picks, then the
 * note on the next line. The server reads both; going back splits them. */
export const withNote = (message: string, note: string): string =>
  [message, note.trim()].filter(Boolean).join("\n");

/** The note an answer was sent with (see withNote), or "". */
export const noteOf = (answer: string): string =>
  answer.split("\n").slice(1).join("\n").trim();

/** The options a past answer picked (several on a multi question, sent as
 * the ticked labels joined by ", " — labels may hold commas themselves). A
 * note sent with them sits on the lines after. */
export function pickedOptions(step: QuestionStep): string[] {
  if (!step.answer) return [];
  const said = step.answer.split("\n")[0].trim().toLowerCase();
  return step.options.filter((o) => {
    const label = o.toLowerCase();
    return step.multi ? `, ${said}, `.includes(`, ${label}, `) : said === label;
  });
}

/** The options a past answer picked on a question with own options (see
 * ``custom``) that are the coach's own: what is left once the options are
 * taken out. Options match whole, so "Salsa" never cuts "Salsa shine". */
export function ownPicked(step: QuestionStep): string[] {
  // A starter's answer is a sentence, not a list: nothing to split out.
  if (!step.custom || step.starter || !step.answer) return [];
  let rest = `, ${step.answer.split("\n")[0].trim()}, `;
  for (const o of step.options) rest = rest.replace(`, ${o}, `, ", ");
  return rest
    .split(", ")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** What the About text she shared at signup pre-ticks on a question she has
 * not answered: the tiles that match one it names (as shown), and her own
 * tiles for the points no tile says, where she can add her own (a finished
 * sentence on a starter question). Else nothing. */
export function prefilledPicks(step: QuestionStep): {
  tiles: string[];
  own: string[];
} {
  const tiles: string[] = [];
  const own: string[] = [];
  if (step.answer) return { tiles, own };
  for (const pick of step.prefill_options ?? []) {
    const tile = step.options.find(
      (o) => o.toLowerCase() === pick.toLowerCase(),
    );
    if (tile) tiles.push(tile);
    else if (step.custom) own.push(pick);
  }
  return { tiles, own };
}

// ---- Class schedules -------------------------------------------------------

// By weekday number (Sunday = 0): the key of its plural, as a timetable says it.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const mondayFirst = (d: number) => (d + 6) % 7;
// "Mondays, Wednesdays and Fridays": English without the Oxford comma, as it always read.
const list = (xs: string[], locale: string) =>
  new Intl.ListFormat(locale === "en" ? "en-GB" : locale, {
    type: "conjunction",
  }).format(xs);
/** Local time from "YYYY-MM-DD" (midnight) or "YYYY-MM-DDTHH:MM". */
const local = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);
const fmtDate = (s: string, year: boolean, locale: string) =>
  formatDayMonth(local(s), locale, year);
/** "18:30" as the locale writes a time ("6:30 PM", "18:30"). */
const fmtTime = (t: string, locale: string) => {
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, h, m))
    .replace(/\u202f/g, " ");
};

/** A slot is ready once it has a weekday and a time. */
const slotReady = (sl: ScheduleSlot) =>
  sl.days.length > 0 && sl.times.some(Boolean);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Where the schedule picker starts (it used to start empty): a weekly class
 * the Monday after today, a single one a week out, both in the evening. The
 * days stay the coach's to pick. ponytail: one evening for every niche. */
export function defaultSchedule(
  mode: ScheduleMode,
  today: Date = new Date(),
): Schedule {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (mode === "once") {
    day.setDate(day.getDate() + 7);
    return { at: `${ymd(day)}T18:00` };
  }
  day.setDate(day.getDate() + ((8 - day.getDay()) % 7 || 7));
  return { start: ymd(day), slots: [{ days: [], times: ["18:00"] }] };
}

export function scheduleValid(mode: ScheduleMode, s: Schedule): boolean {
  return mode === "once"
    ? !!s.at
    : !!s.start && !!s.slots?.length && s.slots.every(slotReady);
}

/** The timezone the browser is in: where the time-zone question opens. */
export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every timezone the browser knows, ``current`` first when it is not on the list. */
export function timeZones(current: string): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  const all = intl.supportedValuesOf?.("timeZone") ?? [];
  return all.includes(current) ? all : [current, ...all];
}

/** The schedule as the creator reads it (a display line, in her language):
 * "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026", or
 * "Tuesday 13 Oct 2026 at 6:30 PM". Each slot reads as its own clause:
 * "Mondays at 9:00 AM; Fridays at 6:00 PM". What the server stores comes from
 * the structured pick (`choice.value`), never from this text. */
export function scheduleSummary(
  mode: ScheduleMode,
  s: Schedule,
  locale: string,
  t: T,
): string {
  if (mode === "once") {
    if (!s.at) return "";
    const weekday = new Intl.DateTimeFormat(locale, {
      weekday: "long",
    }).format(local(s.at));
    return t("schedule.once", {
      weekday,
      date: fmtDate(s.at, true, locale),
      time: fmtTime(s.at.slice(11, 16), locale),
    });
  }
  const when = (s.slots ?? [])
    .filter(slotReady)
    .map((sl) => {
      const days = list(
        [...sl.days]
          .sort((a, b) => mondayFirst(a) - mondayFirst(b))
          .map((d) => t(`schedule.days.${DAY_KEYS[d]}`)),
        locale,
      );
      const times = list(
        sl.times
          .filter(Boolean)
          .sort()
          .map((x) => fmtTime(x, locale)),
        locale,
      );
      return t("schedule.clause", { days, times });
    })
    .join("; ");
  const span = !s.start
    ? ""
    : s.end
      ? t("schedule.span.range", {
          start: fmtDate(s.start, false, locale),
          end: fmtDate(s.end, true, locale),
        })
      : t("schedule.span.open", { start: fmtDate(s.start, true, locale) });
  return when && span ? t("schedule.withSpan", { when, span }) : when || span;
}

/** The first class, as an ISO instant: the one date, or the earliest slot's
 * first weekday on or after the start, at its earliest time. */
export function firstOccurrence(
  mode: ScheduleMode,
  s: Schedule,
): string | null {
  if (mode === "once") return s.at ? local(s.at).toISOString() : null;
  if (!s.start) return null;
  let first: Date | null = null;
  for (const sl of (s.slots ?? []).filter(slotReady)) {
    const d = local(`${s.start}T${sl.times.filter(Boolean).sort()[0]}`);
    for (let i = 0; i < 7 && !sl.days.includes(d.getDay()); i++)
      d.setDate(d.getDate() + 1);
    if (sl.days.includes(d.getDay()) && (!first || d < first)) first = d;
  }
  return first?.toISOString() ?? null;
}
