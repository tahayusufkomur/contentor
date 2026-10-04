// Dev-only stand-in for the setup-flow API (`/setup?mock=1`): an in-memory
// state machine so the layout and transitions can be checked without the
// backend. Never reachable in production (the page gates `mock` on NODE_ENV).
import { ApiError } from "@/types/api";
import type {
  ContentKind,
  SetupFlowApi,
  SetupFlowState,
  SetupStep,
} from "@/lib/setup-flow";

type Def = Omit<SetupStep, "state">;

const DEFS: Def[] = [
  {
    id: "course",
    kind: "content",
    title: "Your first course",
    subtitle: "Turn what you teach into something students can buy.",
    optional: false,
    preview_path: null,
  },
  {
    id: "event",
    kind: "content",
    title: "Your first live class",
    subtitle: "Put a session on the calendar.",
    optional: true,
    preview_path: null,
  },
  {
    id: "page:home",
    kind: "page",
    title: "Home page",
    subtitle: "The first thing visitors see.",
    optional: false,
    page_key: "home",
    preview_path: "/",
  },
  {
    id: "page:about",
    kind: "page",
    title: "About page",
    subtitle: "Your story, in your words.",
    optional: false,
    page_key: "about",
    preview_path: "/about",
  },
  {
    id: "page:courses",
    kind: "page",
    title: "Courses page",
    subtitle: "Where students browse what you offer.",
    optional: false,
    page_key: "courses",
    preview_path: "/courses",
  },
  {
    id: "page:faq",
    kind: "page",
    title: "FAQ page",
    subtitle: "Answers before anyone has to ask.",
    optional: false,
    page_key: "faq",
    preview_path: "/faq",
  },
  {
    id: "page:contact",
    kind: "page",
    title: "Contact page",
    subtitle: "How people reach you.",
    optional: false,
    page_key: "contact",
    preview_path: "/contact",
  },
  {
    id: "payouts",
    kind: "payouts",
    title: "Payouts",
    subtitle: "Get paid for your courses.",
    optional: true,
    preview_path: null,
  },
  {
    id: "launch",
    kind: "launch",
    title: "Launch",
    subtitle: "Open your site to the world.",
    optional: false,
    preview_path: "/",
  },
];

const PREVIEW: Record<ContentKind, string> = {
  course: "/courses",
  event: "/events",
  post: "/blog",
};

const BUILD_MS = 7000;

const s = {
  step: "course",
  done: [] as string[],
  skipped: [] as string[],
  status: "active" as "active" | "done",
  published: false,
  builds: {} as Record<string, number>, // page → ready-at timestamp
  content: {} as Partial<Record<ContentKind, { id: number; title: string }>>,
};

function blockers(): string[] {
  const out: string[] = [];
  if (!s.done.includes("course")) out.push("first_course");
  if (!s.done.includes("payouts")) out.push("payouts");
  return out;
}

function snapshot(): SetupFlowState {
  const now = Date.now();
  return {
    status: s.status,
    step: s.step,
    steps: DEFS.map((d) => ({
      ...d,
      preview_path:
        d.kind === "content"
          ? s.content[d.id as ContentKind]
            ? PREVIEW[d.id as ContentKind]
            : null
          : d.preview_path,
      state:
        d.id === s.step
          ? "active"
          : s.done.includes(d.id)
            ? "done"
            : s.skipped.includes(d.id)
              ? "skipped"
              : "todo",
    })),
    page_builds: Object.fromEntries(
      Object.entries(s.builds).map(([page, at]) => [
        page,
        { status: now >= at ? "ready" : "building" },
      ]),
    ),
    content: {
      course: s.content.course
        ? { ...s.content.course, slug: "draft", is_published: false }
        : null,
      event: s.content.event
        ? { ...s.content.event, is_published: false }
        : null,
      post: null,
    },
    style: "",
    brand_name: "Demo Yoga",
    slug: "demo-yoga",
    publish_blockers: blockers(),
    is_published: s.published,
    suggestions: {
      course: [
        "Yoga for stiff hips: a 4-week reset",
        "Morning flow for busy parents",
        "Breathwork basics for better sleep",
      ],
      event: ["Sunday slow flow, live", "Q&A: building a home practice"],
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function advance() {
  const next = DEFS.find(
    (d) => !s.done.includes(d.id) && !s.skipped.includes(d.id),
  );
  s.step = next?.id ?? "launch";
}

// The backend starts designing pages as soon as the flow begins; the mock
// staggers them so they turn ready over ~10s (the welcome's live strip).
let seeded = false;
function seedBuilds() {
  if (seeded) return;
  seeded = true;
  const t0 = Date.now();
  DEFS.filter((d) => d.page_key).forEach((d, i) => {
    s.builds[d.page_key as string] = t0 + 2500 + i * 2000;
  });
}

export const mockSetupFlowApi: SetupFlowApi = {
  get: async () => {
    seedBuilds();
    await wait(250);
    return snapshot();
  },
  act: async (body) => {
    await wait(400);
    if (body.action === "goto") s.step = body.step;
    if (body.action === "skip") {
      s.skipped = [...s.skipped.filter((x) => x !== body.step), body.step];
      advance();
    }
    if (body.action === "complete") {
      s.done = [...s.done.filter((x) => x !== s.step), s.step];
      s.skipped = s.skipped.filter((x) => x !== s.step);
      advance();
    }
    if (body.action === "finish") {
      if (body.publish && blockers().length > 0) {
        throw new ApiError(400, {
          detail: "A few things need finishing first.",
          blockers: blockers(),
        });
      }
      s.status = "done";
      s.published = body.publish;
    }
    return snapshot();
  },
  buildPage: async (page) => {
    await wait(200);
    if (!(page in s.builds)) s.builds[page] = Date.now() + BUILD_MS;
    return { status: "building" };
  },
  draft: async (kind, prompt) => {
    await wait(5500);
    const title = prompt.slice(0, 60) || "Untitled";
    s.content[kind] = { id: 1, title };
    return { id: 1, title, preview_path: PREVIEW[kind] };
  },
};
