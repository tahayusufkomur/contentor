import { useEffect, useState } from "react";

import { clientFetch } from "@/lib/api-client";

export interface AssistantStatus {
  enabled: boolean;
  reason:
    | "ok"
    | "disabled"
    | "upgrade_required"
    | "budget"
    | "quota"
    | "session_limit";
  greeting: string;
  suggested_questions: string[];
  brand: string;
  human_handoff: boolean;
  link_whitelist: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnswerMeta {
  transcriptId?: number;
  rateToken?: string;
  suggestions?: string[];
}

export interface ThreadMessage {
  id: number;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface ThreadPayload {
  session_id: string;
  status: "ai" | "human";
  agent_label: string;
  human_requested: boolean;
  messages: ThreadMessage[];
}

let statusCache: AssistantStatus | null = null;
const listeners = new Set<(s: AssistantStatus | null) => void>();
let inflight: Promise<void> | null = null;

const SESSION_KEY = "contentor.ai.session.assistant";
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

/** Pure so vitest can cover rotation without a DOM. */
export function resolveSession(
  raw: string | null,
  now: number,
): { id: string; fresh: boolean } {
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; ts?: number };
      if (
        parsed.id &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < SESSION_IDLE_MS
      ) {
        return { id: parsed.id, fresh: false };
      }
    }
  } catch {
    // fall through to a fresh session
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2),
    fresh: true,
  };
}

let sessionId = "";

export function getSessionId(): string {
  if (sessionId) return sessionId;
  const raw =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SESSION_KEY);
  sessionId = resolveSession(raw, Date.now()).id;
  touchSession();
  return sessionId;
}

export function touchSession(): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id: sessionId, ts: Date.now() }),
    );
  } catch {
    // storage unavailable — session stays in-memory
  }
}

function isSameOriginPath(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

/** Hard client-side link containment (v2 spec §9): same-origin paths render
 * as internal links; absolute URLs only when exactly whitelisted. */
export function decideLink(
  href: string,
  origin: string,
  whitelist: string[],
): "internal" | "external" | null {
  if (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith("/\\")
  ) {
    return isSameOriginPath(href, origin) ? "internal" : null;
  }
  return whitelist.includes(href) ? "external" : null;
}

function broadcast(next: AssistantStatus | null) {
  statusCache = next;
  listeners.forEach((l) => l(next));
}

export function refreshAssistantStatus(): Promise<void> {
  inflight ??= fetch("/api/v1/assistant/status/")
    .then(async (res) => {
      if (!res.ok) throw new Error("status failed");
      broadcast((await res.json()) as AssistantStatus);
    })
    .catch(() => broadcast(null)) // fail-soft: widget renders nothing
    .finally(() => {
      inflight = null;
    }) as Promise<void>;
  return inflight;
}

export function useAssistantStatus(): AssistantStatus | null {
  const [status, setStatus] = useState<AssistantStatus | null>(statusCache);
  useEffect(() => {
    listeners.add(setStatus);
    if (statusCache === null) void refreshAssistantStatus();
    return () => {
      listeners.delete(setStatus);
    };
  }, []);
  return status;
}

export async function rateAssistantAnswer(
  meta: AnswerMeta,
  rating: "up" | "down",
): Promise<boolean> {
  if (!meta.transcriptId || !meta.rateToken) return false;
  try {
    const res = await fetch("/api/v1/ai/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_id: meta.transcriptId,
        rate_token: meta.rateToken,
        rating,
      }),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

/** POST the transcript and stream the answer (SSE contract shared with the
 * help bot). Resolves `"ai"` when the AI answered, `"human"` when the
 * session raced into human mode (message already stored server-side — the
 * poller will deliver it). Throws on gating/stream failure. */
export async function streamAssistantChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onDone?: (meta: AnswerMeta) => void,
): Promise<"ai" | "human"> {
  const res = await fetch("/api/v1/assistant/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages, session_id: getSessionId() }),
  });
  if (!res.ok) throw new Error(`assistant request failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    const data = (await res.json()) as {
      enabled?: boolean;
      reason?: string;
      mode?: string;
    };
    if (data.mode === "human") {
      touchSession();
      return "human";
    }
    if (data.enabled === false && statusCache)
      broadcast({
        ...statusCache,
        enabled: false,
        reason: (data.reason as AssistantStatus["reason"]) ?? "disabled",
      });
    throw new Error("unavailable");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming unsupported");
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type: "delta" | "done" | "error";
        text?: string;
        transcript_id?: number;
        rate_token?: string;
        suggestions?: string[];
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") {
        done = true;
        onDone?.({
          transcriptId: event.transcript_id,
          rateToken: event.rate_token,
          suggestions: event.suggestions,
        });
      } else if (event.type === "error") throw new Error("answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
  touchSession();
  return "ai";
}

export async function fetchThread(after = 0): Promise<ThreadPayload | null> {
  try {
    const res = await fetch(
      `/api/v1/assistant/thread/?session=${getSessionId()}&after=${after}`,
      { credentials: "same-origin" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ThreadPayload;
  } catch {
    return null;
  }
}

export async function sendHumanMessage(content: string): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/assistant/human-message/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId(), content }),
    });
    touchSession();
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestHuman(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/assistant/human-request/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Coach admin half (/api/v1/admin/assistant/…) ─────────────────────────────
// Authenticated coach-admin client for /admin/assistant (Task 11). Uses
// clientFetch (cookie-session auth + JSON handling + the demo-readonly toast),
// unlike the student-facing functions above which hit public endpoints with
// plain fetch.

export interface AssistantAdminConfig {
  enabled: boolean;
  greeting: string;
  suggested_questions: string[];
  usage: { questions_used: number; questions_cap: number; month: string };
  status: { enabled: boolean; reason: AssistantStatus["reason"] };
}

export interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  enabled: boolean;
  updated_at: string;
}

export interface TranscriptRow {
  id: number;
  feature: "student_bot" | "help_bot";
  audience: string;
  question: string;
  answer: string;
  rating: "" | "up" | "down";
  is_preview: boolean;
  created_at: string;
}

export const getAssistantConfig = () =>
  clientFetch<AssistantAdminConfig>("/api/v1/admin/assistant/config/");

export const putAssistantConfig = (
  body: Partial<
    Pick<AssistantAdminConfig, "enabled" | "greeting" | "suggested_questions">
  >,
) =>
  clientFetch<AssistantAdminConfig>("/api/v1/admin/assistant/config/", {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const listKnowledge = () =>
  clientFetch<KnowledgeEntry[]>("/api/v1/admin/assistant/knowledge/");

export const createKnowledge = (body: { title: string; content: string }) =>
  clientFetch<KnowledgeEntry>("/api/v1/admin/assistant/knowledge/", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateKnowledge = (
  id: number,
  body: Partial<Pick<KnowledgeEntry, "title" | "content" | "enabled">>,
) =>
  clientFetch<KnowledgeEntry>(`/api/v1/admin/assistant/knowledge/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

// clientFetch already special-cases 204/empty bodies (returns undefined
// without calling res.json()), so this DELETE is safe as-is.
export const deleteKnowledge = (id: number) =>
  clientFetch<void>(`/api/v1/admin/assistant/knowledge/${id}/`, {
    method: "DELETE",
  });

export const listTranscripts = (page = 1) =>
  clientFetch<{ results: TranscriptRow[]; has_more: boolean }>(
    `/api/v1/admin/assistant/transcripts/?page=${page}`,
  );

/** Coach-only: try the assistant from /admin/assistant without turning it on
 * or spending the plan's monthly question quota. Same SSE wire contract as
 * streamAssistantChat, but no session id — the server pins one server-side
 * (session_id="preview") since every preview call is a one-off. Bypasses
 * clientFetch on purpose (SSE isn't a JSON body); mirrors streamHelpBotChat's
 * cookie-session auth over plain fetch. */
export async function streamAssistantPreview(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<void> {
  const res = await fetch("/api/v1/admin/assistant/preview-chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`preview request failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    // Gated (budget/provider down/etc.) — the server responds 200 + JSON
    // instead of a stream. Rare here since the page only renders this pane
    // once the upgrade_required case has already been handled.
    const data = (await res.json()) as { enabled?: boolean; reason?: string };
    throw new Error(data.reason ?? "unavailable");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming unsupported");
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type: "delta" | "done" | "error";
        text?: string;
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") done = true;
      else if (event.type === "error") throw new Error("answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
}
