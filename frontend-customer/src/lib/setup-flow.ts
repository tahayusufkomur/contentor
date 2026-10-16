// Client for the coach's guided onboarding (/setup). Contract:
// GET/POST /api/v1/admin/setup-flow/ (+ build-page/, draft/).
import type { FamilyId } from "@shared/sections/types";
import { clientFetch } from "@/lib/api-client";
import type { ShareDoc } from "@/lib/share-doc";
import { ApiError } from "@/types/api";
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
  /** Options the coach added herself on a multi question, as tiles. */
  custom?: string[];
  /** A starter card's sentence as the coach has finished it, by starter. */
  starts?: Record<string, string>;
  text?: string;
  /** A look card picked but not sent yet. */
  card?: { value: string; label: string };
  /** The dates of a schedule question, as picked so far. */
  schedule?: Schedule;
  /** A social-accounts question: the handle or link typed per network ticked. */
  socials?: Record<string, string>;
  /** A contact question: the email address or number per way ticked. */
  details?: Record<string, string>;
  /** A membership question: the monthly price typed per tier ticked. */
  prices?: Record<string, string>;
  /** A time-zone question: the zone picked. */
  zone?: string;
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
  /** A bio, CV or old About page: read as one turn that fills what it answers. */
  importDoc: (doc: ShareDoc, field?: string) => Promise<TurnResponse>;
  logos: (page: number) => Promise<LookCards>;
  cover: (kind: ReviewKind, asset: string) => Promise<ReviewCard>;
  golive: () => Promise<GoLiveState>;
  goliveAction: (
    action: "publish" | "make_free" | "sell_later",
  ) => Promise<GoLiveState>;
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
  importDoc: ({ file, text }, field) => {
    const form = new FormData();
    if (file) form.append("file", file);
    else form.append("text", text ?? "");
    if (field) form.append("field", field);
    return clientFetch<TurnResponse>(`${BASE}/import/`, {
      method: "POST",
      body: form,
    });
  },
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
  plan: { label: "Start your free trial", step: "plan" },
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

/** A refused answer (the server's 400 detail code), in the coach's words. */
const CHOICE_ERRORS: Record<string, string> = {
  invalid_handle:
    "That handle doesn’t look right. Use your handle, like @mira.yoga, or paste the link to your profile.",
  invalid_schedule: "Pick at least one day and a time for the class.",
  unknown_logo: "That logo isn’t available any more. Pick another one.",
  unknown_style: "That look isn’t available any more. Pick another one.",
};

export function turnErrorText(err: unknown): string {
  const code =
    err instanceof ApiError && err.status === 400
      ? String(err.data.detail ?? "")
      : "";
  return (
    CHOICE_ERRORS[code] ??
    "That didn’t go through. Your answer is still here, so try again in a moment."
  );
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
  /** Logos: a flat catalog mark shown from its image is redrawn in the
   * look's colour; the number lifts its darkest ink to full strength. */
  tint?: number | null;
  /** Generated logos: 1 = the one we would pick. */
  rank?: number;
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
  /** Logos: the look the coach picked, to preview marks in its colours
   * beside ``brand``, her name, as they'll sit in her header. */
  brand?: string;
  style?: string;
  palette?: string;
  /** Looks: picking one opens it as a whole page, its sample copy about
   * ``subject`` ("boxing") and the hero's line in the coach's words. */
  preview?: { subject?: string; body?: string; copy?: LookCopy | null };
}

export type ReviewKind = "course" | "event" | "onsite";
export type BuilderKind = "course" | "event" | "onsite" | "membership";

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
  /** "49.00" when sold on its own, "" when free or for members only. */
  price: string;
  /** The memberships that include it, by name. */
  members?: string[];
  currency: string;
  cover_url: string;
  covers: { value: string; url: string; current: boolean }[];
  modules?: { title: string; lessons: string[] }[];
  when?: string;
  /** A weekly class: its whole timetable ("Tuesdays and Thursdays at 7:00 PM, …"). */
  repeats?: string;
  event_kind?: "live" | "onsite";
  location?: string;
  /** The street address of an in-person class. */
  address?: string;
}

/** The review screen of a draft: still drafting, drafted, or failed. */
export interface ReviewCard {
  kind: ReviewKind;
  /** waiting: a class held until go-live adds live classes to the plan. */
  status: "building" | "ready" | "failed" | "waiting";
  item: ReviewItem | null;
}

/** One shape of photo the site uses: how many a home page shows, what for,
 * and what to shoot (backend interview_milestones.photo_guide). */
export interface PhotoShot {
  shape: "portrait" | "landscape" | "square";
  label: string;
  aspect: string;
  count: number;
  use: string;
  shoot: string;
}

/** One of the coach's own photos, as the photos question lists it. */
export interface OwnPhoto {
  id: string;
  url: string;
  title: string;
  width: number | null;
  height: number | null;
  /** "pending" (being made web-ready), "indexing", "ready" or "failed". */
  status: string;
}

/** The photos question: what to bring, and what she has added so far. */
export interface PhotoCards {
  kind: "photos";
  guide: PhotoShot[];
  photos: OwnPhoto[];
  max: number;
}

/** What a question screen shows beside its words: looks, or a draft. */
export type QuestionCards = LookCards | ReviewCard;
export type GuideCards = QuestionCards | PhotoCards;

export const isReview = (c: GuideCards | null | undefined): c is ReviewCard =>
  c?.kind === "course" || c?.kind === "event" || c?.kind === "onsite";

export const isPhotos = (c: GuideCards | null | undefined): c is PhotoCards =>
  c?.kind === "photos";

/** The paid plan some of a question's options need (backend interview_golive.plan_badge). */
export interface PlanBadge {
  name: string;
  amount_cents: number | null;
  currency: string;
  options: string[];
}

export interface GuideTurn {
  ack: string;
  question: string;
  options: string[];
  field: string | null;
  can_delegate: boolean;
  /** Several options can be ticked, then sent together. */
  multi?: boolean;
  /** Several picks, and the coach can add options of her own (a blank tile). */
  custom?: boolean;
  /** The option that can't be ticked with any other ("Free for now"). */
  alone?: string | null;
  /** Lucide icon id per option (only options that have one). */
  icons?: Record<string, string>;
  /** One short line per option, shown under it (fixed questions only). */
  hints?: Record<string, string>;
  /** Label of the button that skips this question's section, if it has one. */
  skip?: string | null;
  /** One short description per option, shown under it. */
  details?: Record<string, string>;
  /** The question builds something: a live preview of it sits beside the answers. */
  builder?: BuilderKind;
  /** The answer is a schedule: a tile picks weekly or one-time, then the dates. */
  schedule?: boolean;
  /** The answer is a handle or link for each network ticked. */
  socials?: boolean;
  /** The answer is a place and its street address, each in its own box. */
  address?: boolean;
  /** The options are sentence starters: picked as cards, each finished
   * inline in its card, and never sent as-is. */
  starter?: boolean;
  /** One line under the question: why it matters. */
  why?: string;
  /** The plan the listed paid options need, shown on their tiles. */
  plan?: PlanBadge | null;
  cards?: GuideCards | null;
  /** Work this turn just started ("I'm starting on your About page now."). */
  status?: string;
  /** Other questions this answer also filled ("your training"). */
  noted?: string[];
  /** The ways ticked take their details (an email address, a number). */
  contact?: boolean;
  /** Details the question starts with (the coach's signup email). */
  prefill?: Record<string, string>;
  /** Text to prefill in the answer box from coach's about text. */
  prefill_text?: string | null;
  /** Option labels to pre-select based on coach's about text. */
  prefill_options?: string[];
  /** The answer is a time zone, picked from the browser's list. */
  timezone?: boolean;
  /** The screen takes the coach's own photos, or leaves them to the guide. */
  photos?: boolean;
  /** Membership tiles: her monthly price for each, editable once ticked,
   * in the currency whose ``sign`` is given. */
  prices?: Record<string, number>;
  sign?: string;
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
  /** The finished site's last visual check (every page, desktop and phone,
   *  light and dark); null where the check is off or the site still builds. */
  qa: {
    status: "checking" | "done" | "failed";
    pages: number;
    /** What it fixed, in the coach's words. */
    fixed: string[];
  } | null;
  needs_plan: boolean;
  /** A trial whose site sells: selling opens when the plan starts. */
  needs_start: boolean;
  /** When the trial's first charge runs (ISO), while one runs. */
  trial_end: string | null;
  needs_payouts: boolean;
  plan: {
    id: number;
    name: string;
    amount_cents: number | null;
    currency: string;
    /** Free days a checkout opens with now (0 = paid from today). */
    trial_days: number;
  } | null;
  blockers: string[];
  /** Every step left before going live, with its time. */
  steps: GoLiveStep[];
  /** What the interview built ("Memberships": "Online membership (19 USD a month)"). */
  summary: { label: string; value: string }[];
  /** What "make it free" would change, said before the coach agrees. */
  free_effects: string[];
  /** What "go live now, sell later" holds back, with its prices, until she can take payments. */
  held: string[];
}

export interface GoLiveStep {
  id: "plan" | "payouts" | "publish";
  label: string;
  minutes: number;
  done: boolean;
}
