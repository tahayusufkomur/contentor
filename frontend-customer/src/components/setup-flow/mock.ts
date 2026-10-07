// Dev-only replay of this tenant's recorded interview (`/setup?mock=1`):
// the real setup-flow state is fetched once for the transcript and the
// look, logo and review cards, then every turn pre-selects what the coach
// answered last time and serves the next recorded question. No AI call, no
// site build, so the screens can be iterated on in seconds. `&at=N` opens
// on the Nth question. Never reachable in production (the page gates `mock`
// on NODE_ENV).
//
// The replay also shapes the recorded questions into the flow being tried
// out before the backend learns it: at most 8 answers, "You decide" only
// where the guide can decide, descriptions on the offers tiles, builder
// previews beside the course, membership and class questions, a working
// "Try another version", a drafted first class and a multi-pick location.
import { pickedOptions } from "@/lib/interview";
import {
  isReview,
  setupFlowApi,
  type BuilderKind,
  type GuideCards,
  type GuideTurn,
  type InterviewEntry,
  type ReviewCard,
  type ReviewItem,
  type ReviewKind,
  type SetupFlowApi,
  type SetupFlowState,
  type StepDraft,
} from "@/lib/setup-flow";

const TURN_MS = 350;
const REDRAFT_MS = 2600;
const MAX_OPTIONS = 8;
const REDRAFT = "Draft a different version, please.";
const REVIEW_KIND: Record<string, ReviewKind> = {
  course_review: "course",
  event_review: "event",
};
/** Questions the guide may answer for the coach; the rest only they know. */
const DELEGABLE = new Set([
  "site_style",
  "site_logo",
  "tone",
  "course_topic",
  "course_price",
  "membership_price",
  "live_topic",
  "live_when",
  "event_price",
  "article_topic",
]);
const BUILDER: Record<string, BuilderKind> = {
  course_topic: "course",
  course_price: "course",
  membership_price: "membership",
  live_topic: "event",
  live_when: "event",
  event_price: "event",
};
const REWORDED: Record<string, string> = {
  course_topic: "Let's build your first course. What should it teach?",
  membership_price:
    "Would you like to create your first membership? Pick what it costs a month.",
  live_topic: "Let's set up your first live class. What should it focus on?",
};
const SKIPS: Record<string, string> = {
  membership_price: "No membership for now",
};
const MULTI = new Set(["location"]);
const RENAME: Record<string, string> = { Courses: "Digital Courses" };
const DETAILS: Record<string, Record<string, string>> = {
  offers: {
    "Digital Courses":
      "Pre-recorded lessons students buy once and follow at their own pace.",
    "Live online classes":
      "Scheduled video sessions students join from home, with you live.",
    "In-person sessions": "Classes, workshops or retreats at your own place.",
    Articles:
      "A blog that brings new students in from search and keeps them reading.",
    Community:
      "A members' space where your students talk, share and stay motivated.",
  },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Guide = Extract<InterviewEntry, { role: "guide" }>;

const s = {
  real: null as SetupFlowState | null,
  recorded: [] as InterviewEntry[],
  /** Where each recorded coach answer sits in the transcript, in order. */
  answers: [] as number[],
  /** How many of them have been sent in this replay. */
  i: 0,
  /** The replay's transcript: recorded up to the live question, then what
   * was actually sent this time. */
  turns: [] as InterviewEntry[],
  published: false,
  /** "Try another version": the draft is "building" until this time. */
  redraftUntil: {} as Partial<Record<ReviewKind, number>>,
  version: {} as Partial<Record<ReviewKind, number>>,
  coverPick: {} as Partial<Record<ReviewKind, string>>,
};

const rename = (label: string) => RENAME[label] ?? label;
const rekey = (m?: Record<string, string>) =>
  m && Object.fromEntries(Object.entries(m).map(([k, v]) => [rename(k), v]));

/** At most MAX_OPTIONS answers, always including the recorded picks. */
function cap(guide: Guide, answer?: string): string[] {
  const options = guide.options.map(rename);
  if (options.length <= MAX_OPTIONS) return options;
  const picked = new Set(pickedOptions({ ...guide, options, answer }));
  let room = MAX_OPTIONS - picked.size;
  return options.filter((o) => picked.has(o) || room-- > 0);
}

/** The recorded question, shaped for the flow being tried out. */
function shape(guide: Guide, answer?: string): Guide {
  const field = guide.field ?? "";
  return {
    ...guide,
    options: cap(guide, answer),
    icons: rekey(guide.icons),
    hints: rekey(guide.hints),
    can_delegate: guide.can_delegate && DELEGABLE.has(field),
    multi: guide.multi || MULTI.has(field),
    question: REWORDED[field] ?? guide.question,
    skip: SKIPS[field] ?? guide.skip,
    ...(DETAILS[field] ? { details: DETAILS[field] } : {}),
    ...(BUILDER[field] ? { builder: BUILDER[field] } : {}),
  };
}

async function init() {
  if (s.real) return;
  s.real = await setupFlowApi.get();
  const turns = s.real.interview.turns;
  s.recorded = turns.map((t, i) => {
    if (t.role === "coach")
      return t.field === "offers"
        ? { ...t, text: t.text.split(", ").map(rename).join(", ") }
        : t;
    const next = turns[i + 1];
    return shape(t, next?.role === "coach" ? next.text : undefined);
  });
  s.answers = s.recorded.flatMap((t, i) => (t.role === "coach" ? [i] : []));
  const at = Number(new URLSearchParams(window.location.search).get("at"));
  s.i = Math.min(Math.max(at || 0, 0), s.answers.length);
  s.turns = s.recorded.slice(0, cut(s.i));
}

/** The transcript just before the Nth recorded answer. */
const cut = (n: number) =>
  n < s.answers.length ? s.answers[n] : s.recorded.length;

/** What the coach has said so far in this replay, by question. */
function said(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of s.turns)
    if (t.role === "coach" && t.field) out[t.field] = t.text;
  return out;
}

/** The first class as the backend would draft it (the recording ran on the
 * free plan, where the class waits for go-live). */
function draftedClass(): ReviewItem {
  const course = s.real?.interview.cards?.course_review;
  const from = isReview(course) ? course.item : null;
  const covers = from?.covers ?? [];
  const a = said();
  const who = (a.audience ?? "everyone").split(", ").slice(0, 2).join(" and ");
  const when = new Date();
  when.setDate(when.getDate() + ((9 - when.getDay()) % 7 || 7));
  when.setHours(18, 30, 0, 0);
  return {
    title: a.live_topic ?? "Your first live class",
    description: `A live, coach-led session on ${(a.live_topic ?? "the basics").toLowerCase()} for ${who.toLowerCase()}: a proper warm-up, technique, drills and a cool-down, with time for questions.`,
    price: (a.event_price ?? "").replace(/[^\d.]/g, ""),
    currency: from?.currency ?? "usd",
    cover_url: covers[1]?.url ?? covers[0]?.url ?? "",
    covers: covers.map((c, i) => ({ ...c, current: i === 1 })),
    when: when.toISOString(),
    event_kind: "live",
  };
}

/** The real cards for a question, with the prototype's additions: a page to
 * preview each look in, redrafts and cover picks on the reviews, a drafted
 * first class. */
function cardsFor(field: string | null): GuideCards | null {
  const cards = field ? s.real?.interview.cards?.[field] : undefined;
  if (!cards) return null;
  if (!isReview(cards)) {
    if (cards.kind !== "style") return cards;
    // "Boxing Club" → the sample copy talks about boxing.
    const teaches = s.recorded.find(
      (t) => t.role === "coach" && t.field === "teaches",
    );
    const subject =
      (teaches?.role === "coach" ? teaches.text : "")
        .toLowerCase()
        .replace(
          /\b(club|studio|gym|school|academy|coaching|lessons|classes)\b/g,
          "",
        )
        .trim() || "training";
    // The hero's line: what makes them different, then what students get.
    const a = said();
    const gets = (a.outcome ?? "")
      .split(", ")
      .filter(Boolean)
      .slice(0, 4)
      .map((o, i) => (i ? o.charAt(0).toLowerCase() + o.slice(1) : o));
    const body = [
      a.difference && `${a.difference.replace(/\.$/, "")}.`,
      gets.length &&
        `${gets.length > 1 ? `${gets.slice(0, -1).join(", ")} and ${gets.at(-1)}` : gets[0]}.`,
    ]
      .filter(Boolean)
      .join(" ");
    return { ...cards, preview: { subject, ...(body ? { body } : {}) } };
  }
  const kind = cards.kind;
  if ((s.redraftUntil[kind] ?? 0) > Date.now())
    return { kind, status: "building", item: null };
  const item = cards.item ?? (kind === "event" ? draftedClass() : null);
  if (!item) return cards;
  const covers = item.covers;
  const pick =
    s.coverPick[kind] ??
    covers[(s.version[kind] ?? 0) % Math.max(covers.length, 1)]?.value;
  const cover = covers.find((c) => c.value === pick);
  return {
    kind,
    status: "ready",
    item: cover
      ? {
          ...item,
          cover_url: cover.url,
          covers: covers.map((c) => ({
            ...c,
            current: c.value === cover.value,
          })),
        }
      : item,
  };
}

function liveGuide(): GuideTurn {
  let last: Guide | undefined;
  for (const t of s.turns) if (t.role === "guide") last = t;
  const {
    role: _role,
    edit: _edit,
    ...guide
  } = last ?? {
    role: "guide" as const,
    ack: "",
    question: "",
    options: [],
    field: null,
    can_delegate: false,
  };
  return { ...guide, cards: cardsFor(guide.field) };
}

function snapshot(): SetupFlowState {
  const real = s.real as SetupFlowState;
  const remaining = s.answers.length - s.i;
  const building = s.turns.some((t) => t.role === "guide" && !!t.status);
  const now = Date.now();
  return {
    ...real,
    is_published: s.published,
    interview: {
      ...real.interview,
      turns: s.turns,
      guide: liveGuide(),
      cards: Object.fromEntries(
        Object.keys(real.interview.cards ?? {}).map((k) => [k, cardsFor(k)]),
      ) as Record<string, GuideCards>,
      remaining,
      phase: !remaining ? "golive" : building ? "building" : "interview",
      fired: [],
      draft_status: Object.fromEntries(
        Object.entries(s.redraftUntil)
          .filter(([, t]) => (t ?? 0) > now)
          .map(([k]) => [k, "building" as const]),
      ),
    },
  };
}

/** What the coach answered on the live question last time. */
function recordedAnswer() {
  const at = s.answers[s.i];
  const entry = at == null ? undefined : s.recorded[at];
  return entry?.role === "coach" ? entry : undefined;
}

export const mockSetupFlowApi: SetupFlowApi = {
  get: async () => {
    await init();
    return snapshot();
  },
  act: async () => snapshot(),
  buildPage: async () => ({}),
  draft: async () => ({ id: 1, title: "Draft", preview_path: "/courses" }),
  turn: async (req) => {
    await wait(TURN_MS);
    const live = liveGuide().field;
    const field = req.choice?.field ?? req.field ?? live;
    const kind = live ? REVIEW_KIND[live] : undefined;
    if (kind && field === live && req.message === REDRAFT) {
      // Another version: the review drafts again, then shows a new cover.
      s.redraftUntil[kind] = Date.now() + REDRAFT_MS;
      s.version[kind] = (s.version[kind] ?? 0) + 1;
      delete s.coverPick[kind];
    } else if (field && field !== live) {
      // Went back and re-answered: keep the new words, stay on the live question.
      let i = s.turns.length - 1;
      while (
        i >= 0 &&
        !(s.turns[i].role === "coach" && s.turns[i].field === field)
      )
        i--;
      if (i >= 0)
        s.turns = s.turns.map((t, j) =>
          j === i ? { ...t, text: req.message } : t,
        );
    } else if (s.i < s.answers.length) {
      s.turns = [
        ...s.turns,
        { role: "coach", text: req.message, field },
        ...s.recorded.slice(s.answers[s.i] + 1, cut(s.i + 1)),
      ];
      s.i += 1;
    }
    return {
      coach_text: req.message,
      guide: liveGuide(),
      edit: null,
      fired: [],
      state: snapshot(),
    };
  },
  preset: (field): StepDraft | undefined => {
    const said = recordedAnswer();
    if (!said || said.field !== field) return undefined;
    const guide = liveGuide();
    if (isReview(guide.cards)) return undefined;
    if (guide.cards) {
      const o = guide.cards.options.find(
        (o) => o.label.toLowerCase() === said.text.trim().toLowerCase(),
      );
      return o ? { card: { value: o.value, label: o.label } } : undefined;
    }
    const ticked = pickedOptions({ ...guide, answer: said.text });
    return ticked.length ? { ticked } : { text: said.text };
  },
  logos: (page) => setupFlowApi.logos(page),
  cover: async (kind, asset) => {
    s.coverPick[kind] = asset;
    const card = cardsFor(`${kind}_review`);
    return isReview(card)
      ? card
      : ({ kind, status: "ready", item: null } as ReviewCard);
  },
  golive: () => setupFlowApi.golive(),
  goliveAction: async (action) => {
    if (action === "publish") s.published = true;
    return setupFlowApi.golive();
  },
};
