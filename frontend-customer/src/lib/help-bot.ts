import { useEffect, useState } from "react";

import { clientFetch } from "@/lib/api-client";

export interface HelpBotStatus {
  enabled: boolean;
  reason: "ok" | "disabled" | "budget" | "quota";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

/** POST the transcript and stream the answer. Calls onDelta per text chunk;
 * resolves when the answer is complete. SSE bypasses clientFetch on purpose
 * (it JSON-parses whole bodies). Throws HelpBotUnavailable when the server
 * reports the bot off/capped, plain Error on stream failure. */
export async function streamHelpBotChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/v1/admin/help-bot/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) throw new Error(`help bot request failed (${res.status})`);

  // Caps/config problems come back as a plain JSON body, not a stream.
  if (res.headers.get("content-type")?.includes("application/json")) {
    const data = (await res.json()) as { enabled?: boolean; reason?: string };
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
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") done = true;
      else if (event.type === "error")
        throw new Error(event.message ?? "answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
}
