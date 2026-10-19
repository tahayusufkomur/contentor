import { clientFetch } from "@/lib/api-client";
import type { SpecialistKey } from "@/lib/copilot/team";
import type { CoverDesign } from "@/types/design";

import type { FocusKind } from "./kinds";

// Mirrors backend/apps/core/focus/flow.py (state, question) and views.py.

export interface FocusOption {
  value: string;
  label: string;
  hint: string;
}

export interface FocusQuestion {
  field: string;
  kind:
    | "text"
    | "choice"
    | "review"
    | "cover"
    | "price"
    | "finish"
    | "announce"
    | "schedule"
    | "upload";
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
  /** A schedule question: her site's time zone, the one its times are in (G13). */
  timezone?: string;
  /** A message's finish: "Also by email" as her words left it. */
  tick?: boolean;
}

export interface FocusRecord {
  id: number;
  /** A course's; an event has none. */
  slug?: string;
  /** An event's kind (live, stream, zoom, onsite). */
  kind?: string;
  title: string;
  /** Its page in the studio. */
  path: string;
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

/** Marketing's announcement draft (backend focus/announce.py ``payload``),
 *  while "Tell your students?" is the question. */
export interface FocusAnnouncement {
  status: OutlineStatus;
  run: number;
  id: number | null;
  title: string;
  body: string;
  /** ISO with her site's offset. */
  send_at: string | null;
  /** Her site's time zone: the time is shown on its clock. */
  zone: string | null;
}

export interface FocusState {
  /** 0 = provisional: the first question, before her first answer creates it. */
  id: number;
  kind: FocusKind;
  status: "active" | "done" | "left";
  chat: number | null;
  record: FocusRecord | null;
  question: FocusQuestion | null;
  answered: { field: string; label: string }[];
  /** `drafted`: an outline is on the page (a failed redraft leaves the earlier one). */
  outline: { status: OutlineStatus; run: number | null; drafted: boolean };
  /** An analysis of her typed answer is pending; `question` is null meanwhile. */
  reading: { status: OutlineStatus; run: number | null } | null;
  /** A follow-up question is being written; `question` is null meanwhile. */
  thinking: {
    status: OutlineStatus;
    run: number;
    specialist: SpecialistKey;
  } | null;
  descriptions: { status: OutlineStatus; run: number | null } | null;
  /** The copy job (a kind it drafts: an event's title and description); null
   *  until it first starts. */
  copy?: { status: OutlineStatus; run: number } | null;
  /** null until the Designer was first asked for covers. */
  cover: FocusCover | null;
  announcement: FocusAnnouncement | null;
  steps: { id: string; done: boolean }[];
}

export interface FocusOverview {
  enabled: boolean;
  /** The kinds switched on; the store reads a missing list as none. */
  kinds: FocusKind[];
  first: Partial<Record<string, FocusQuestion>>;
  /** A creation with no record yet (an event before she said where) has its working title. */
  open: {
    id: number;
    kind: FocusKind;
    record: FocusRecord | null;
    title?: string;
  }[];
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
  body: Timed<Omit<AnswerBody, "field"> & { kind: FocusKind }>,
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

export const finishCreation = (
  id: number,
  body: Timed<{ publish: boolean; announce: boolean }>,
) =>
  // `closing`: what her tap did, as the chat says it ("Sent.", "Scheduled for …").
  post<FocusState & { closing?: string }>(`${id}/finish/`, body);

export const announceCreation = (
  id: number,
  body: Timed<{ schedule: boolean }> | { retry: true },
) => post<FocusState>(`${id}/announce/`, body);

export const leaveCreation = (id: number, body: Timed<{ abandon?: boolean }>) =>
  post<FocusState>(`${id}/leave/`, body);

/** An event's stamp names the row's kind too (`eventKind`): its pk alone is not the record. */
export const postFormTiming = (
  kind: FocusKind,
  recordId: number,
  activeMs: number,
  eventKind?: string,
) =>
  post<void>("form-timing/", {
    kind,
    record_id: recordId,
    active_ms: activeMs,
    ...(eventKind && { event_kind: eventKind }),
  });
