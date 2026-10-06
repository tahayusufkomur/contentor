// Client for the coach's guided onboarding (/setup). Contract:
// GET/POST /api/v1/admin/setup-flow/ (+ build-page/, draft/).
import { clientFetch } from "@/lib/api-client";
import type { LogoMark } from "@/types/tenant";

export type StepKind = "content" | "page" | "payouts" | "launch";
export type StepState = "done" | "active" | "todo" | "skipped";
export type ContentKind = "course" | "event" | "post";
export type BuildStatus = "idle" | "building" | "ready" | "failed";

export interface SetupStep {
  id: string;
  kind: StepKind;
  title: string;
  subtitle: string;
  state: StepState;
  optional: boolean;
  page_key?: string;
  preview_path: string | null;
}

export interface ContentDraft {
  id: number;
  title: string;
  slug?: string;
  is_published: boolean;
}

export interface SetupFlowState {
  status: "active" | "done";
  step: string;
  steps: SetupStep[];
  page_builds: Record<
    string,
    {
      status: BuildStatus;
      updated_at?: string;
      /** Where a running build is; absent while it is still planning. */
      stage?: "copy" | "photos";
    }
  >;
  content: Partial<Record<ContentKind, ContentDraft | null>>;
  style: string;
  brand_name: string;
  slug: string;
  publish_blockers: string[];
  is_published: boolean;
  suggestions: Partial<Record<ContentKind, string[]>>;
  interview: InterviewState;
}

export type SetupAction =
  | { action: "goto" | "skip"; step: string }
  | { action: "complete"; step?: string }
  | { action: "finish"; publish: boolean };

export interface DraftResult {
  id: number;
  title: string;
  slug?: string;
  preview_path: string;
}

export interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  is_paid_active: boolean;
}

/** The seam the UI talks to — the real API below, or the dev mock. */
export interface SetupFlowApi {
  get: () => Promise<SetupFlowState>;
  act: (body: SetupAction) => Promise<SetupFlowState>;
  buildPage: (page: string, force?: boolean) => Promise<unknown>;
  draft: (kind: ContentKind, prompt: string) => Promise<DraftResult>;
  turn: (body: TurnRequest) => Promise<TurnResponse>;
  logos: (page: number) => Promise<LookCards>;
  cover: (kind: ReviewKind, asset: string) => Promise<ReviewCard>;
  golive: () => Promise<GoLiveState>;
  goliveAction: (action: "publish" | "make_free") => Promise<GoLiveState>;
}

const BASE = "/api/v1/admin/setup-flow";
const post = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const setupFlowApi: SetupFlowApi = {
  get: () => clientFetch<SetupFlowState>(`${BASE}/`),
  act: (body) => clientFetch<SetupFlowState>(`${BASE}/`, post(body)),
  buildPage: (page, force = false) =>
    clientFetch(`${BASE}/build-page/`, post({ page, force })),
  draft: (kind, prompt) =>
    clientFetch<DraftResult>(`${BASE}/draft/`, post({ kind, prompt })),
  turn: (body) => clientFetch<TurnResponse>(`${BASE}/turn/`, post(body)),
  logos: (page) => clientFetch<LookCards>(`${BASE}/logos/?page=${page}`),
  cover: (kind, asset) =>
    clientFetch<ReviewCard>(`${BASE}/cover/`, post({ kind, asset })),
  golive: () => clientFetch<GoLiveState>(`${BASE}/golive/`),
  goliveAction: (action) =>
    clientFetch<GoLiveState>(`${BASE}/golive/`, post({ action })),
};

export const fetchConnectStatus = (refresh: boolean) =>
  clientFetch<ConnectStatus>(
    `/api/v1/billing/connect/status/${refresh ? "?refresh=1" : ""}`,
  );

export const startConnectOnboarding = () =>
  clientFetch<{ onboarding_url: string }>(
    "/api/v1/billing/connect/onboard/",
    post({ return_path: "/setup?connect=return" }),
  );

/** Which step fixes each publish blocker, and how to say it. */
export const BLOCKERS: Record<string, { label: string; step: string }> = {
  first_course: { label: "Publish your first course", step: "course" },
  payouts: { label: "Connect payouts", step: "payouts" },
  first_event: { label: "Schedule your first live class", step: "event" },
  first_blog_post: { label: "Publish your first article", step: "post" },
  look: { label: "Finish your home page", step: "page:home" },
};

/** iframe src for a public path, flagged so the site renders without the
 * owner chrome and without the /setup redirect. */
export function embedSrc(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}embed=1`;
}

export const DELEGATE = "__delegate__";
/** Skip a section (the first course, class or article). */
export const SKIP = "__skip__";
/** What the coach "says" when they leave a question to the guide. */
export const DELEGATE_TEXT = "You decide for me.";

export interface LookOption {
  value: string;
  label: string;
  detail?: string;
  image_url?: string;
  /** Looks: the section style and its colourway ("" = the style's own). */
  style?: string;
  palette?: string;
  /** The guide's pick for this coach. */
  recommended?: boolean;
  /** Logos: the vector mark, previewed in the coach's look. */
  mark?: LogoMark | null;
}

export interface LookCards {
  kind: "style" | "logo";
  options: LookOption[];
  page?: number;
  more?: boolean;
  /** Photos of what the coach teaches, shown in the look previews. */
  photos?: string[];
  /** The coach's pitch, the previews' headline. */
  headline?: string;
  /** Logos: the look the coach picked, to preview marks in its colours. */
  style?: string;
  palette?: string;
}

export type ReviewKind = "course" | "event";

/** The interview's first course or class, as drafted. */
export interface ReviewItem {
  title: string;
  description: string;
  /** "49.00" when sold on its own, "" when free. */
  price: string;
  currency: string;
  cover_url: string;
  covers: { value: string; url: string; current: boolean }[];
  modules?: { title: string; lessons: string[] }[];
  when?: string;
  event_kind?: "live" | "onsite";
  location?: string;
}

/** The review screen of a draft: still drafting, drafted, or failed. */
export interface ReviewCard {
  kind: ReviewKind;
  /** waiting: a class held until go-live adds live classes to the plan. */
  status: "building" | "ready" | "failed" | "waiting";
  item: ReviewItem | null;
}

export type GuideCards = LookCards | ReviewCard;

export const isReview = (c: GuideCards | null | undefined): c is ReviewCard =>
  c?.kind === "course" || c?.kind === "event";

export interface GuideTurn {
  ack: string;
  question: string;
  options: string[];
  field: string | null;
  can_delegate: boolean;
  /** Several options can be ticked, then sent together. */
  multi?: boolean;
  /** Lucide icon id per option (only options that have one). */
  icons?: Record<string, string>;
  /** One short line per option, shown under it (fixed questions only). */
  hints?: Record<string, string>;
  /** Label of the button that skips this question's section, if it has one. */
  skip?: string | null;
  cards?: GuideCards | null;
  /** Work this turn just started ("I'm starting on your About page now."). */
  status?: string;
}

export interface CopilotCard {
  kind: string;
  title: string;
  token: string;
}

export interface CopilotPayload {
  kind: "answer" | "ask" | "actions" | "unavailable";
  text?: string;
  actions?: CopilotCard[];
}

export type InterviewEntry =
  | {
      role: "coach";
      text: string;
      /** The question this answers (older turns: the one asked before it). */
      field?: string | null;
    }
  | ({ role: "guide"; edit?: CopilotPayload } & Omit<GuideTurn, "cards">);

export interface InterviewState {
  turns: InterviewEntry[];
  guide: GuideTurn;
  remaining: number;
  phase: "interview" | "building" | "golive";
  fired: string[];
  draft_status: Partial<Record<ContentKind, "building" | "ready" | "failed">>;
  /** Fresh cards for look and review questions already behind the coach. */
  cards?: Partial<Record<string, GuideCards>>;
}

export interface TurnRequest {
  message: string;
  spoken?: boolean;
  choice?: { field: string; value: string };
  /** An earlier question the coach went back to (default: the live one). */
  field?: string;
}

export interface TurnResponse {
  coach_text: string;
  guide: GuideTurn;
  edit: CopilotPayload | null;
  fired: string[];
  state: SetupFlowState;
}

export interface GoLiveState {
  ready: boolean;
  building: boolean;
  needs_plan: boolean;
  needs_payouts: boolean;
  plan: {
    id: number;
    name: string;
    amount_cents: number | null;
    currency: string;
  } | null;
  blockers: string[];
}
