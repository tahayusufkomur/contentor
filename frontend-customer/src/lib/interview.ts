// Pure helpers for the /setup interview (no runtime imports: unit-tested in isolation).
import type { GuideTurn, InterviewEntry } from "@/lib/setup-flow";

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

export function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
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
          field,
          can_delegate,
          multi,
          icons,
          hints,
          skip,
        } = e;
        const answer = asked.get(e.field)?.answer;
        asked.set(e.field, {
          ack,
          question,
          options,
          field,
          can_delegate,
          multi,
          icons,
          hints,
          skip,
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

/** The options a past answer picked (several on a multi question, sent as
 * the ticked labels joined by ", " — labels may hold commas themselves). */
export function pickedOptions(step: QuestionStep): string[] {
  if (!step.answer) return [];
  const said = step.answer.trim().toLowerCase();
  return step.options.filter((o) => {
    const label = o.toLowerCase();
    return step.multi ? `, ${said}, `.includes(`, ${label}, `) : said === label;
  });
}
