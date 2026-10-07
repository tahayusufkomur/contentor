// Dev-only replay of this tenant's recorded interview (`/setup?mock=1`):
// the real setup-flow state is fetched once for the transcript and the
// look, logo and review cards, then every turn pre-selects what the coach
// answered last time and serves the next recorded question. No AI call, no
// site build, so the screens can be iterated on in seconds. `&at=N` opens
// on the Nth question. Never reachable in production (the page gates `mock`
// on NODE_ENV).
import { pickedOptions } from "@/lib/interview";
import {
  isReview,
  setupFlowApi,
  type GuideTurn,
  type InterviewEntry,
  type ReviewCard,
  type SetupFlowApi,
  type SetupFlowState,
  type StepDraft,
} from "@/lib/setup-flow";

const TURN_MS = 350;
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
};

async function init() {
  if (s.real) return;
  s.real = await setupFlowApi.get();
  s.recorded = s.real.interview.turns;
  s.answers = s.recorded.flatMap((t, i) => (t.role === "coach" ? [i] : []));
  const at = Number(new URLSearchParams(window.location.search).get("at"));
  s.i = Math.min(Math.max(at || 0, 0), s.answers.length);
  s.turns = s.recorded.slice(0, cut(s.i));
}

/** The transcript just before the Nth recorded answer. */
const cut = (n: number) =>
  n < s.answers.length ? s.answers[n] : s.recorded.length;

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
  const cards = guide.field ? s.real?.interview.cards?.[guide.field] : null;
  return { ...guide, cards: cards ?? null };
}

function snapshot(): SetupFlowState {
  const real = s.real as SetupFlowState;
  const remaining = s.answers.length - s.i;
  const building = s.turns.some((t) => t.role === "guide" && !!t.status);
  return {
    ...real,
    is_published: s.published,
    interview: {
      ...real.interview,
      turns: s.turns,
      guide: liveGuide(),
      remaining,
      phase: !remaining ? "golive" : building ? "building" : "interview",
      fired: [],
      draft_status: {},
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
    if (field && field !== live) {
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
  cover: async (kind) => {
    const card = s.real?.interview.cards?.[`${kind}_review`];
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
