// Client for the coach's guided onboarding (/setup). Contract:
// GET/POST /api/v1/admin/setup-flow/ (+ build-page/, draft/).
import { clientFetch } from "@/lib/api-client";

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
  page_builds: Record<string, { status: BuildStatus; updated_at?: string }>;
  content: Partial<Record<ContentKind, ContentDraft | null>>;
  style: string;
  brand_name: string;
  slug: string;
  publish_blockers: string[];
  is_published: boolean;
  suggestions: Partial<Record<ContentKind, string[]>>;
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
};

export const fetchConnectStatus = (refresh: boolean) =>
  clientFetch<ConnectStatus>(
    `/api/v1/billing/connect/status/${refresh ? "?refresh=1" : ""}`,
  );

export const startConnectOnboarding = () =>
  clientFetch<{ onboarding_url: string }>(
    "/api/v1/billing/connect/onboard/",
    post({ return_path: "/setup?step=payouts" }),
  );

/** Which step fixes each publish blocker, and how to say it. */
export const BLOCKERS: Record<string, { label: string; step: string }> = {
  first_course: { label: "Publish your first course", step: "course" },
  payouts: { label: "Connect payouts", step: "payouts" },
  first_event: { label: "Schedule your first live class", step: "event" },
  first_blog_post: { label: "Publish your first article", step: "post" },
  look: { label: "Finish your home page", step: "page:home" },
};

export const STEP_GROUPS: { label: string; kinds: StepKind[] }[] = [
  { label: "Your content", kinds: ["content"] },
  { label: "Your pages", kinds: ["page"] },
  { label: "Go live", kinds: ["payouts", "launch"] },
];

/** iframe src for a public path, flagged so the site renders without the
 * owner chrome and without the /setup redirect. */
export function embedSrc(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}embed=1`;
}
