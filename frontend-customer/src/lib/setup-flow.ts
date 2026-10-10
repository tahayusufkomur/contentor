// Client for the coach's guided onboarding (/setup). Contract:
// GET/POST /api/v1/admin/setup-flow/ (+ build-page/, draft/).
import type { FamilyId } from "@shared/sections/types";
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

/** What the coach has ticked or typed on a question but not sent yet. */
export interface StepDraft {
  ticked?: string[];
  text?: string;
  /** A look card picked but not sent yet. */
  card?: { value: string; label: string };
  /** The dates of a schedule question, as picked so far. */
  schedule?: Schedule;
  /** A social-accounts question: the handle or link typed per network ticked. */
  socials?: Record<string, string>;
}

/** The seam the UI talks to — the real API below, or the dev mock. */
export interface SetupFlowApi {
  get: () => Promise<SetupFlowState>;
  /** Dev mock only: what the live question opens pre-filled with. */
  preset?: (field: string) => StepDraft | undefined;
  act: (body: SetupAction) => Promise<SetupFlowState>;
  buildPage: (page: string, force?: boolean) => Promise<unknown>;
  draft: (kind: ContentKind, prompt: string) => Promise<DraftResult>;
  turn: (body: TurnRequest) => Promise<TurnResponse>;
  logos: (page: number) => Promise<LookCards>;
  /** Start three more generated logos; the answer is the logo card. */
  logoMore: () => Promise<LookCards>;
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
  logoMore: () =>
    clientFetch<LookCards>(`${BASE}/logo-more/`, { method: "POST" }),
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

/** The sample words written for this coach (backend look_copy.py), shown by
 * every look in its own layout. Each family's keys are that family's text
 * fields; list items carry title and text. */
export type LookCopy = Partial<Record<FamilyId, Record<string, unknown>>> & {
  courses?: { title: string; description: string }[];
};

export interface LookOption {
  value: string;
  label: string;
  detail?: string;
  image_url?: string;
  /** Looks: the section style and its colourway ("" = the style's own). */
  style?: string;
  palette?: string;
  /** Looks: the colourways the style comes in, its own first (id ""). */
  palettes?: { id: string; label: string }[];
  /** Looks: the hero layout it shares with others ("Headline beside a
   * photo"); the grid shows the best of each first. */
  group?: string;
  /** Looks: what the look is for, filterable (STYLE_TAGS). */
  tags?: string[];
  /** The guide's pick for this coach. */
  recommended?: boolean;
  /** Why it is the pick ("Made for dance coaches, and it sounds playful."). */
  reason?: string;
  /** Logos: the vector mark, previewed in the coach's look. */
  mark?: LogoMark | null;
  /** Generated logos: 1 = the one we would pick. */
  rank?: number;
}

/** The logos designed for this coach while they answered. */
export interface GeneratedLogos {
  /** building = a batch is running; ready = options are ranked best first. */
  state: "building" | "ready" | "none";
  options: LookOption[];
}

export interface LookCards {
  kind: "style" | "logo" | "calendar";
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
  /** Logos: the ones designed for this coach, above the curated grid. */
  generated?: GeneratedLogos;
  /** Looks: picking one opens it as a whole page, its sample copy about
   * ``subject`` ("boxing") and the hero's line in the coach's words. */
  preview?: { subject?: string; body?: string; copy?: LookCopy | null };
}

export type ReviewKind = "course" | "event";
export type BuilderKind = ReviewKind | "membership";

/** When a class runs: weekly on set days and times between two dates, or
 * once, on one date and time (`at`). Dates "YYYY-MM-DD", times "HH:MM",
 * days as JS weekdays (0 = Sunday). */
/** One set of weekdays and the times the class runs on them. */
export interface ScheduleSlot {
  days: number[];
  times: string[];
}
export interface Schedule {
  start?: string;
  end?: string;
  /** The weekly slots: a class can run on several days and times. */
  slots?: ScheduleSlot[];
  /** The coach's timezone (an IANA name). */
  tz?: string;
  at?: string;
}
export type ScheduleMode = "recurring" | "once";

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
  /** The option that can't be ticked with any other ("Free for now"). */
  alone?: string | null;
  /** Lucide icon id per option (only options that have one). */
  icons?: Record<string, string>;
  /** One short line per option, shown under it (fixed questions only). */
  hints?: Record<string, string>;
  /** Label of the button that skips this question's section, if it has one. */
  skip?: string | null;
  /** One short description per option, shown once it is picked. */
  details?: Record<string, string>;
  /** The question builds something: a live preview of it sits beside the answers. */
  builder?: BuilderKind;
  /** The answer is a schedule: a tile picks weekly or one-time, then the dates. */
  schedule?: boolean;
  /** The answer is a handle or link for each network ticked. */
  socials?: boolean;
  /** The options are sentence starters: a tap puts one in the box to
   * finish, and it is never sent as-is. */
  starter?: boolean;
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
  /** The generated-logo batch: polled while it is building. */
  logo_batch?: { state: "building" | "ready" | "failed" | "none" };
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
