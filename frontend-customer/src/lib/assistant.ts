import { useEffect, useState } from "react";

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
