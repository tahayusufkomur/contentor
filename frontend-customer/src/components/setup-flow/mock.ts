// Dev-only stand-in for the setup-flow API (`/setup?mock=1`): a scripted
// interview so the layout and transitions can be checked without the
// backend. Never reachable in production (the page gates `mock` on NODE_ENV).
import type {
  GoLiveState,
  GuideTurn,
  InterviewEntry,
  SetupFlowApi,
  SetupFlowState,
} from "@/lib/setup-flow";

const SCRIPT: GuideTurn[] = [
  {
    ack: "Hi! I'll ask you a few questions and build your site while we talk.",
    question: "Let's start with you. What do you teach?",
    options: ["Yoga", "Pilates", "Fitness coaching"],
    field: "teaches",
    can_delegate: true,
  },
  {
    ack: "Lovely.",
    question: "Who are the students you love teaching most?",
    options: ["Complete beginners", "Busy professionals"],
    field: "audience",
    can_delegate: true,
  },
  {
    ack: "Got it.",
    question: "Which look feels most like you?",
    options: [],
    field: "site_style",
    can_delegate: true,
    cards: {
      kind: "style",
      options: [
        {
          value: "journal",
          label: "Quiet Journal",
          detail: "Calm and editorial",
        },
        { value: "grid", label: "Swiss Grid", detail: "Crisp and structured" },
      ],
    },
  },
  {
    ack: "Great choice.",
    question: "What's your first course about?",
    options: [],
    field: "course_topic",
    can_delegate: true,
  },
];
const BUILD_MS = 6000;
const s = { i: 0, turns: [] as InterviewEntry[], homeAt: 0, published: false };

function snapshot(): SetupFlowState {
  const done = s.i >= SCRIPT.length;
  const guide: GuideTurn = done
    ? {
        ack: "",
        question:
          "Your site is ready. Take a look around, then go live when you're happy.",
        options: [],
        field: null,
        can_delegate: false,
      }
    : SCRIPT[s.i];
  const home = s.homeAt
    ? Date.now() >= s.homeAt
      ? "ready"
      : "building"
    : "idle";
  return {
    status: s.published ? "done" : "active",
    step: "course",
    steps: [
      {
        id: "page:home",
        kind: "page",
        title: "Home page",
        subtitle: "",
        state: "todo",
        optional: false,
        page_key: "home",
        preview_path: "/",
      },
    ],
    page_builds: { home: { status: home } },
    content: {},
    style: "journal",
    brand_name: "Demo Yoga",
    slug: "demo-yoga",
    publish_blockers: [],
    is_published: s.published,
    suggestions: {},
    interview: {
      turns: s.turns,
      guide,
      remaining: Math.max(SCRIPT.length - s.i, 0),
      phase: done ? "golive" : s.i >= 2 ? "building" : "interview",
      fired: s.homeAt ? ["page:home"] : [],
      draft_status: {},
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const golive = (): GoLiveState => ({
  ready: true,
  building: false,
  needs_plan: false,
  needs_payouts: false,
  plan: null,
  blockers: [],
});

export const mockSetupFlowApi: SetupFlowApi = {
  get: async () => snapshot(),
  act: async () => snapshot(),
  buildPage: async () => ({}),
  draft: async () => ({ id: 1, title: "Draft", preview_path: "/courses" }),
  turn: async (body) => {
    await wait(900);
    s.turns = [...s.turns, { role: "coach", text: body.message }];
    s.i += 1;
    if (s.i === 2) s.homeAt = Date.now() + BUILD_MS;
    const state = snapshot();
    const { cards: _cards, ...rest } = state.interview.guide;
    s.turns = [...s.turns, { role: "guide", ...rest }];
    return {
      coach_text: body.message,
      guide: state.interview.guide,
      edit: null,
      fired: [],
      state: snapshot(),
    };
  },
  logos: async (page) => ({ kind: "logo", page, more: false, options: [] }),
  golive: async () => golive(),
  goliveAction: async (action) => {
    if (action === "publish") s.published = true;
    return golive();
  },
};
