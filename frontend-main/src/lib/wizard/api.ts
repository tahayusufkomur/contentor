/** Wizard API client. Token rides in the BODY (never the URL) — same
 * convention as src/lib/api/onboarding.ts. */

import { ApiError } from "@/types/api";
import type {
  CuratedLogoItem,
  WizardAnswers,
  WizardCatalog,
  WizardStateResponse,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json() as Promise<T>;
}

export function getWizardCatalog(): Promise<WizardCatalog> {
  return request("/api/v1/onboarding/wizard/catalog/");
}

export function readWizardState(token: string): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface PatchWizardBody {
  answers?: WizardAnswers;
  current_step?: string;
  finished_rest_for_me?: boolean;
}

export function patchWizardState(
  token: string,
  body: PatchWizardBody,
): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "PATCH",
    body: JSON.stringify({ token, ...body }),
  });
}

export function finalizeWizard(
  token: string,
): Promise<{ slug: string; status: string; template_status: string }> {
  return request("/api/v1/onboarding/wizard/finalize/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface CourseOutline {
  title: string;
  description: string;
  suggested_price: number;
}

/**
 * Provision the tenant schema early (content-step entry). Idempotent: only a
 * 'pending' tenant enqueues; any other state just reports its current status,
 * so this doubles as the poll.
 */
export function provisionWizard(token: string): Promise<{ status: string }> {
  return request("/api/v1/onboarding/wizard/provision/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getCourseOutlines(
  token: string,
): Promise<{ outlines: CourseOutline[] }> {
  return request("/api/v1/onboarding/wizard/content/course-outlines/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function createWizardCourse(
  token: string,
  body: { title: string; description?: string; price?: number },
): Promise<{ id: number; slug: string }> {
  return request("/api/v1/onboarding/wizard/content/course/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

export function createWizardEvent(
  token: string,
  body: { kind: "live" | "onsite"; title: string; scheduled_at?: string },
): Promise<{ id: number }> {
  return request("/api/v1/onboarding/wizard/content/event/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

export function createWizardBlog(
  token: string,
  body: { title: string; body_html?: string; status?: "draft" | "published" },
): Promise<{ id: number; slug: string }> {
  return request("/api/v1/onboarding/wizard/content/blog/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

/**
 * Compose-at-reveal for the content-first flow: the tenant is already
 * provisioned and holds the coach's real content, so the reveal only needs the
 * compose step. Returns immediately; the caller polls onboarding/status until
 * "ready", exactly as the classic flow does after finalize.
 */
export function composeWizard(token: string): Promise<{ status: string }> {
  return request("/api/v1/onboarding/wizard/compose/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getDescribeFollowups(
  token: string,
  description: string,
  signal?: AbortSignal,
): Promise<{ questions: string[] }> {
  return request("/api/v1/onboarding/wizard/describe-followups/", {
    method: "POST",
    body: JSON.stringify({ token, description }),
    signal,
  });
}

export function getCuratedLogos(): Promise<CuratedLogoItem[]> {
  return request("/api/v1/logos/curated/");
}

export function recoverWizard(token: string): Promise<{ detail: string }> {
  return request("/api/v1/onboarding/wizard/recover/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// ── Reveal chat: natural-language site refinement ───────────────────────────
// SSE reader ported from frontend-customer/src/lib/ai-stream.ts (a separate
// Next.js app — no shared module between the two frontends for this).

export interface SiteEditPreviewHandlers {
  /** Named step of the work — e.g. "thinking". */
  onPhase?: (phase: string) => void;
}

/** The server reported a terminal failure mid-stream. */
export class SiteEditStreamError extends Error {
  readonly source: string;

  constructor(source: string) {
    super(`site edit preview failed: ${source}`);
    this.name = "SiteEditStreamError";
    this.source = source;
  }
}

/** True when a rejection is the caller's own abort() rather than a failure. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

type SiteEditFrame =
  | { type: "phase"; phase: string }
  | { type: "done"; pages: unknown }
  | { type: "error"; source?: string };

/**
 * Stream a proposed site edit for a natural-language instruction. Resolves
 * with the proposed `pages` (not yet saved — call applySiteEdit to persist).
 * Free to call: only applySiteEdit consumes a reveal allowance.
 */
export async function previewSiteEdit(
  token: string,
  instruction: string,
  handlers: SiteEditPreviewHandlers = {},
  signal?: AbortSignal,
): Promise<{ pages: unknown }> {
  const res = await fetch("/api/v1/onboarding/wizard/site-edit/preview/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "same-origin",
    body: JSON.stringify({ token, instruction }),
    signal,
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming unsupported");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { pages: unknown } | undefined;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    // A frame can be split across chunks — keep the trailing partial.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as SiteEditFrame;
      if (event.type === "phase") handlers.onPhase?.(event.phase);
      else if (event.type === "done") result = { pages: event.pages };
      else if (event.type === "error")
        throw new SiteEditStreamError(event.source ?? "error");
    }
  }
  if (result === undefined) throw new Error("stream ended early");
  return result;
}

/** Persist a previewed edit. Decrements the reveal's free-applies counter;
 * throws ApiError(402) once the 3 free applies are spent. */
export function applySiteEdit(
  token: string,
  pages: unknown,
): Promise<{ remaining: number }> {
  return request("/api/v1/onboarding/wizard/site-edit/apply/", {
    method: "POST",
    body: JSON.stringify({ token, pages }),
  });
}
