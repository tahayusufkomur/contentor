import { useEffect, useState } from "react";

import { clientFetch } from "@/lib/api-client";

export interface AssistantStatus {
  enabled: boolean;
  reason: "ok" | "disabled" | "upgrade_required" | "budget" | "quota";
  greeting: string;
  suggested_questions: string[];
  brand: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnswerMeta {
  transcriptId?: number;
  rateToken?: string;
}

let statusCache: AssistantStatus | null = null;
const listeners = new Set<(s: AssistantStatus | null) => void>();
let inflight: Promise<void> | null = null;

const sessionId =
  globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);

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
 * help bot). Resolves when complete; throws on gating/stream failure. */
export async function streamAssistantChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onDone?: (meta: AnswerMeta) => void,
): Promise<void> {
  const res = await fetch("/api/v1/assistant/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`assistant request failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    const data = (await res.json()) as { enabled?: boolean; reason?: string };
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
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") {
        done = true;
        onDone?.({
          transcriptId: event.transcript_id,
          rateToken: event.rate_token,
        });
      } else if (event.type === "error") throw new Error("answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
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
