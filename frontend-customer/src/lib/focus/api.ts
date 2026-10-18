import { clientFetch } from "@/lib/api-client";
import type { SpecialistKey } from "@/lib/copilot/team";
import type { CoverDesign } from "@/types/design";

// Mirrors backend/apps/core/focus/flow.py (state, question) and views.py.

export interface FocusOption {
  value: string;
  label: string;
  hint: string;
}

export interface FocusQuestion {
  field: string;
  kind: "text" | "choice" | "review" | "cover" | "price" | "finish";
  question: string;
  why: string;
  options: FocusOption[];
  /** A sentence starter she finishes ("A course on "), or null. */
  starter: string | null;
  can_delegate: boolean;
  specialist: SpecialistKey;
  /** The price step: the tile "You decide" highlights for her to tap. */
  suggested?: string | null;
  /** Finish with "Start selling": her plan is on, so payouts come next. */
  paid_active?: boolean;
}

export interface FocusRecord {
  id: number;
  slug: string;
  title: string;
}

export type OutlineStatus = "idle" | "building" | "ready" | "failed";

/** The cover step (backend focus/covers.py ``payload``): the round on screen
 *  as drawable designs ("d0".."d3"), the photo they share and her words for it. */
export interface FocusCover {
  status: OutlineStatus;
  run: number | null;
  round: number;
  drafts: CoverDesign[];
  photo: { id: string; url: string } | null;
  query: string;
}

export interface CoverPhoto {
  /** Hers are "own:<uuid>"; the rest are library images. */
  asset_id: string;
  url: string;
  title: string;
  mine: boolean;
}

export interface FocusState {
  /** 0 = provisional: the first question, before her first answer creates it. */
  id: number;
  kind: string;
  status: "active" | "done" | "left";
  chat: number | null;
  record: FocusRecord | null;
  question: FocusQuestion | null;
  answered: { field: string; label: string }[];
  outline: { status: OutlineStatus; run: number | null };
  /** An analysis of her typed answer is pending; `question` is null meanwhile. */
  reading: { status: OutlineStatus; run: number | null } | null;
  descriptions: { status: OutlineStatus; run: number | null } | null;
  /** null until the Designer was first asked for covers. */
  cover: FocusCover | null;
  steps: { id: string; done: boolean }[];
}

export interface FocusOverview {
  enabled: boolean;
  first: Partial<Record<string, FocusQuestion>>;
  open: { id: number; kind: string; record: FocusRecord }[];
}

export interface AnswerBody {
  field: string;
  value?: string;
  text?: string;
  delegate?: boolean;
  rest?: boolean;
}

type Timed<T> = T & { active_ms?: number };

const BASE = "/api/v1/admin/focus";
const post = <T>(path: string, body: unknown) =>
  clientFetch<T>(`${BASE}/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchOverview = () => clientFetch<FocusOverview>(`${BASE}/`);

export const startCreation = (
  body: Timed<Omit<AnswerBody, "field"> & { kind: string }>,
) => post<FocusState>("", body);

export const fetchCreation = (id: number) =>
  clientFetch<FocusState>(`${BASE}/${id}/`);

export const answerCreation = (id: number, body: Timed<AnswerBody>) =>
  post<FocusState>(`${id}/answer/`, body);

export const retryDescriptions = (id: number) =>
  post<FocusState>(`${id}/descriptions/`, {});

export const fetchCoverPhotos = (id: number, q: string, page: number) =>
  clientFetch<{ results: CoverPhoto[]; has_next: boolean }>(
    `${BASE}/${id}/photos/?${new URLSearchParams({ q, page: String(page) })}`,
  );

export const coverAction = (
  id: number,
  body:
    | { action: "photo"; asset_id: string }
    | { action: "keep" | "edit"; index: number }
    | { action: "more" | "later" },
) => post<FocusState & { design_id?: string | null }>(`${id}/cover/`, body);

export const finishCreation = (id: number, body: Timed<{ publish: boolean }>) =>
  post<FocusState>(`${id}/finish/`, body);

export const leaveCreation = (id: number, body: Timed<{ abandon?: boolean }>) =>
  post<FocusState>(`${id}/leave/`, body);

export const postFormTiming = (courseId: number, activeMs: number) =>
  post<void>("form-timing/", { course_id: courseId, active_ms: activeMs });
