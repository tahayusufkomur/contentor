// Pure helpers for the /setup interview (no runtime imports: unit-tested in isolation).
import type {
  GuideTurn,
  InterviewEntry,
  Schedule,
  ScheduleMode,
  ScheduleSlot,
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

const PAGE_LABELS: Record<string, string> = {
  home: "home page",
  about: "About page",
  courses: "Courses page",
  pricing: "Pricing page",
  faq: "FAQ page",
  contact: "Contact page",
  events: "Events page",
};
export const pageLabel = (key: string) => PAGE_LABELS[key] ?? `${key} page`;

const DRAFT_LABELS: Record<string, string> = {
  course: "your first course",
  event: "your first class",
  post: "your first article",
};

/** A running build's server-reported stage → its index in the overlay's
 * three steps (no stage yet = still planning). */
export function stageIndex(stage?: string): number {
  return stage === "photos" ? 2 : stage === "copy" ? 1 : 0;
}

const STAGE_NOW = [
  "planning the layout",
  "writing the words",
  "picking photos",
];

/** What the guide is working on right now, or null when nothing is. */
export function activityLine(builds: Builds, drafts: Drafts): string | null {
  const items = [
    ...Object.keys(builds)
      .filter((k) => builds[k]?.status === "building")
      .map(
        (k) =>
          `Building your ${pageLabel(k)}: ${STAGE_NOW[stageIndex(builds[k]?.stage)]}`,
      ),
    ...Object.keys(drafts)
      .filter((k) => drafts[k] === "building")
      .map((k) => `Drafting ${DRAFT_LABELS[k] ?? k}`),
  ];
  if (!items.length) return null;
  return items.length > 1
    ? `${items[0]} · ${items.length - 1} more on the way`
    : items[0];
}

const DRAFT_DONE: Record<string, string> = {
  course: "Your first course is drafted. I’m adding it to your Courses page.",
  event: "Your first class is on the calendar.",
  post: "Your first article is drafted.",
};

/** What the guide says about work that finished between two polls. */
export function finishedNotes(
  prev: { builds: Builds; drafts: Drafts },
  next: { builds: Builds; drafts: Drafts },
): string[] {
  const notes: string[] = [];
  for (const k of Object.keys(next.builds)) {
    const was = prev.builds[k]?.status;
    const now = next.builds[k]?.status;
    if (now === "ready" && was !== "ready") {
      notes.push(
        k === "home"
          ? "Your home page is ready. Have a look, and tell me anything you’d like changed."
          : `Your ${pageLabel(k)} is ready. Have a look.`,
      );
    } else if (now === "failed" && was === "building") {
      notes.push(
        `I couldn’t finish your ${pageLabel(k)}, so it keeps its first version for now.`,
      );
    }
  }
  for (const k of Object.keys(next.drafts)) {
    const was = prev.drafts[k];
    const now = next.drafts[k];
    if (now === "ready" && was !== "ready" && DRAFT_DONE[k]) {
      notes.push(DRAFT_DONE[k]);
    } else if (now === "failed" && was === "building") {
      notes.push(
        `I couldn’t draft ${DRAFT_LABELS[k] ?? k}. You can add it from your dashboard later.`,
      );
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

/** Contact ways that need a detail, as interview_brief.CONTACT_DETAILS. */
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

export function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** "Starter plan · $19.90/mo": the plan a paid choice needs. */
export function planLabel(plan: {
  name: string;
  amount_cents: number | null;
  currency: string;
}): string {
  const name = plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
  const price = formatPrice(plan.amount_cents, plan.currency);
  return price ? `${name} plan · ${price}/mo` : `${name} plan`;
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
          field,
          can_delegate,
          multi,
          alone,
          icons,
          hints,
          skip,
          details,
          builder,
          schedule,
          socials,
          starter,
          why,
          plan,
          contact,
          prefill,
          timezone,
        } = e;
        const answer = asked.get(e.field)?.answer;
        asked.set(e.field, {
          ack,
          question,
          options,
          field,
          can_delegate,
          multi,
          alone,
          icons,
          hints,
          skip,
          details,
          builder,
          schedule,
          socials,
          starter,
          why,
          plan,
          contact,
          prefill,
          timezone,
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
 * section, so it never jumps the way a question count did. */
export const SECTIONS: { label: string; fields: string[] }[] = [
  { label: "You", fields: ["teaches", "specialty"] },
  { label: "Students", fields: ["audience", "outcome"] },
  { label: "Offer", fields: ["offers", "pitch", "difference"] },
  {
    label: "Look & story",
    fields: ["tone", "site_style", "story", "credentials", "site_logo"],
  },
  {
    label: "Pricing & content",
    fields: [
      "timezone",
      "currency",
      "payments",
      "memberships",
      "course_topic",
      "course_price",
      "course_review",
      "live_topic",
      "live_when",
      "event_price",
      "event_review",
      "article_topic",
    ],
  },
  { label: "Contact", fields: ["socials", "contact", "location"] },
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

/** A starter tile put in the answer box: appended without its trailing
 * "…", with a space to keep typing after. */
export const addStarter = (text: string, starter: string): string =>
  `${[text.trimEnd(), starter.replace(/\s*(…|\.\.\.)$/, "")].filter(Boolean).join(" ")} `;

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

// ---- Class schedules -------------------------------------------------------

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];
const mondayFirst = (d: number) => (d + 6) % 7;
const list = (xs: string[]) =>
  xs.length > 1
    ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
    : (xs[0] ?? "");
/** Local time from "YYYY-MM-DD" (midnight) or "YYYY-MM-DDTHH:MM". */
const local = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);
const fmtDate = (s: string, year: boolean) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
  }).format(local(s));
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
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

/** The schedule as the coach would say it: "Tuesdays and Thursdays at
 * 6:30 PM, from 12 Oct to 7 Dec 2026", or "Tuesday 13 Oct 2026 at 6:30 PM".
 * Each slot reads as its own clause: "Mondays at 9:00 AM; Fridays at 6:00 PM". */
export function scheduleSummary(mode: ScheduleMode, s: Schedule): string {
  if (mode === "once") {
    if (!s.at) return "";
    const day = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(
      local(s.at),
    );
    return `${day} ${fmtDate(s.at, true)} at ${fmtTime(s.at.slice(11, 16))}`;
  }
  const when = (s.slots ?? [])
    .filter(slotReady)
    .map((sl) => {
      const days = list(
        [...sl.days]
          .sort((a, b) => mondayFirst(a) - mondayFirst(b))
          .map((d) => DAY_NAMES[d]),
      );
      const times = list(sl.times.filter(Boolean).sort().map(fmtTime));
      return `${days} at ${times}`;
    })
    .join("; ");
  const span = !s.start
    ? ""
    : s.end
      ? `from ${fmtDate(s.start, false)} to ${fmtDate(s.end, true)}`
      : `from ${fmtDate(s.start, true)}`;
  return [when, span].filter(Boolean).join(", ");
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
