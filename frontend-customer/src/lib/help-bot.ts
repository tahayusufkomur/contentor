import { useEffect, useState } from "react";

import { clientFetch } from "@/lib/api-client";
import {
  resolveSession,
  type AnswerMeta,
  type ThreadMessage,
  type ThreadPayload,
} from "@/lib/assistant";

export type { AnswerMeta, ThreadMessage, ThreadPayload };

export interface HelpBotStatus {
  enabled: boolean;
  reason: "ok" | "disabled" | "budget" | "quota";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Fire-and-forget thumbs. Returns false on any failure — rating is
 * best-effort, the UI just resets its highlight. */
export async function rateAnswer(
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

// Module-level cache: bubble + panel share one status fetch (same pattern as
// lib/setup-assistant.ts).
let statusCache: HelpBotStatus | null = null;
const listeners = new Set<(s: HelpBotStatus | null) => void>();
let inflight: Promise<void> | null = null;

function broadcast(next: HelpBotStatus | null) {
  statusCache = next;
  listeners.forEach((listener) => listener(next));
}

export function refreshHelpBotStatus(): Promise<void> {
  inflight ??= clientFetch<HelpBotStatus>("/api/v1/admin/help-bot/status/")
    .then(broadcast)
    .catch(() => {}) // fail-soft: help surfaces render nothing
    .finally(() => {
      inflight = null;
    }) as Promise<void>;
  return inflight;
}

export function useHelpBotStatus(): HelpBotStatus | null {
  const [status, setStatus] = useState<HelpBotStatus | null>(statusCache);
  useEffect(() => {
    listeners.add(setStatus);
    if (statusCache === null) void refreshHelpBotStatus();
    return () => {
      listeners.delete(setStatus);
    };
  }, []);
  return status;
}

export class HelpBotUnavailable extends Error {
  constructor(public reason: HelpBotStatus["reason"]) {
    super(reason);
  }
}

// ── Session (Task 17 — mirrors lib/assistant.ts's getSessionId/touchSession,
// distinct localStorage key so the coach's help-bot session never collides
// with the student-facing site assistant's) ────────────────────────────────

const SESSION_KEY = "contentor.ai.session.help";

let sessionId = "";

export function getHelpSessionId(): string {
  if (sessionId) return sessionId;
  const raw =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SESSION_KEY);
  sessionId = resolveSession(raw, Date.now()).id;
  touchHelpSession();
  return sessionId;
}

export function touchHelpSession(): void {
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

/** POST the transcript and stream the answer. Calls onDelta per text chunk;
 * resolves `"ai"` when the AI answered, `"human"` when the conversation was
 * already in human mode server-side (the coach's message is stored, no
 * stream to read — the poller delivers the reply). SSE bypasses clientFetch
 * on purpose (it JSON-parses whole bodies). Throws HelpBotUnavailable when
 * the server reports the bot off/capped, plain Error on stream failure.
 * onDone (when provided) receives the transcript rating metadata plus any
 * follow-up suggestions from the `done` event. */
export async function streamHelpBotChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onDone?: (meta: AnswerMeta) => void,
): Promise<"ai" | "human"> {
  const res = await fetch("/api/v1/admin/help-bot/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages, session_id: getHelpSessionId() }),
  });
  if (!res.ok) throw new Error(`help bot request failed (${res.status})`);

  // Caps/config problems, and a conversation already in human mode, come
  // back as a plain JSON body, not a stream.
  if (res.headers.get("content-type")?.includes("application/json")) {
    const data = (await res.json()) as {
      enabled?: boolean;
      reason?: string;
      mode?: string;
    };
    if (data.mode === "human") {
      touchHelpSession();
      return "human";
    }
    if (data.enabled === false) {
      broadcast({
        enabled: false,
        reason: (data.reason as HelpBotStatus["reason"]) ?? "disabled",
      });
      throw new HelpBotUnavailable(
        (data.reason as HelpBotStatus["reason"]) ?? "disabled",
      );
    }
    throw new Error("unexpected response");
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
        message?: string;
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
      } else if (event.type === "error")
        throw new Error(event.message ?? "answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
  touchHelpSession();
  return "ai";
}

/** Widget polling endpoint — coach console's own thread (mirrors
 * lib/assistant.ts's fetchThread). Via clientFetch since this is an
 * authenticated coach-admin surface (unlike the student bot's anonymous
 * plain-fetch equivalent); a 404 (no conversation yet — nothing sent) or any
 * other failure resolves to null so the poller just skips that tick. */
export async function fetchHelpThread(
  after = 0,
): Promise<ThreadPayload | null> {
  try {
    return await clientFetch<ThreadPayload>(
      `/api/v1/admin/help-bot/thread/?session=${getHelpSessionId()}&after=${after}`,
    );
  } catch {
    return null;
  }
}

export async function sendHelpHumanMessage(content: string): Promise<boolean> {
  try {
    await clientFetch<{ mode: "ai" | "human" }>(
      "/api/v1/admin/help-bot/human-message/",
      {
        method: "POST",
        body: JSON.stringify({ session_id: getHelpSessionId(), content }),
      },
    );
    touchHelpSession();
    return true;
  } catch {
    return false;
  }
}

export async function requestHelpHuman(): Promise<boolean> {
  try {
    await clientFetch<{ ok: boolean }>(
      "/api/v1/admin/help-bot/human-request/",
      {
        method: "POST",
        body: JSON.stringify({ session_id: getHelpSessionId() }),
      },
    );
    return true;
  } catch {
    return false;
  }
}
