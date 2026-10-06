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

/** A guide turn as it is kept in the transcript (cards are re-fetched fresh). */
export function toEntry(guide: GuideTurn): InterviewEntry {
  const { cards: _cards, ...rest } = guide;
  return { role: "guide", ...rest };
}

/** A short status line from the guide (e.g. an applied change). */
export function noteEntry(text: string, auditId?: number): InterviewEntry {
  return {
    role: "guide",
    ack: text,
    question: "",
    options: [],
    field: null,
    can_delegate: false,
    ...(auditId != null ? { audit_id: auditId } : {}),
  };
}

export function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** The transcript around the latest guide question, which is drawn live with
 * its chips: what came before it, and the notes that came after it — those
 * go between its ack and its question, so the question always sits last,
 * next to the answer box, and the transcript stays in order. */
export function splitEntries(
  entries: InterviewEntry[],
  sending: boolean,
): { past: InterviewEntry[]; after: InterviewEntry[] } {
  let live = -1;
  if (!sending)
    entries.forEach((e, i) => {
      if (e.role === "guide" && e.question) live = i;
    });
  return live === -1
    ? { past: entries, after: [] }
    : { past: entries.slice(0, live), after: entries.slice(live + 1) };
}
