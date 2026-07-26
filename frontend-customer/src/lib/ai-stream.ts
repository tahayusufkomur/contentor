// Reader for the structured-AI progress streams (see backend
// apps/core/ai_sse.py). The long AI calls — blog drafts, logo designs — used
// to sit silent for 45s behind a spinner, which reads as a hang; they now
// stream {"type": …} frames describing the work as it happens.
//
// Bypasses clientFetch on purpose (SSE isn't a JSON body), mirroring
// streamAssistantChat / streamAssistantPreview in lib/assistant.ts.

/** A frame the server may send. `phase`/`preview` are progress; `done` and
 * `error` are terminal. */
type StreamFrame =
  | { type: "phase"; phase: string }
  | ({ type: "preview" } & Record<string, unknown>)
  | ({ type: "done" } & Record<string, unknown>)
  | { type: "error"; source?: string };

export interface AiStreamHandlers<TPreview> {
  /** Named step of the work — "preparing", "drafting", "rendering". */
  onPhase?: (phase: string) => void;
  /** Partial result so far, feature-shaped. */
  onPreview?: (preview: TPreview) => void;
}

/** The server reported a terminal failure mid-stream. `source` mirrors the
 * reason codes the non-streaming endpoints return. */
export class AiStreamError extends Error {
  readonly source: string;

  constructor(source: string) {
    super(`ai stream failed: ${source}`);
    this.name = "AiStreamError";
    this.source = source;
  }
}

/** True when a rejection is the caller's own abort() rather than a failure —
 * cancelling is a normal outcome and must not raise an error toast. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * POST `path` and consume the SSE progress stream, resolving with the
 * terminal payload.
 *
 * Gating (quota exhausted, budget, provider disabled) is decided BEFORE the
 * stream opens, so the server answers those with plain JSON instead. That
 * payload has the same shape as the done frame and is returned identically —
 * callers branch on its `source`, exactly as they did before streaming.
 */
export async function streamAi<TDone, TPreview = unknown>(
  path: string,
  body: unknown,
  handlers: AiStreamHandlers<TPreview> = {},
  signal?: AbortSignal,
): Promise<TDone> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    return (await res.json()) as TDone;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming unsupported");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TDone | undefined;

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
      const event = JSON.parse(line.slice(6)) as StreamFrame;
      if (event.type === "phase") handlers.onPhase?.(event.phase);
      else if (event.type === "preview") {
        const { type: _type, ...preview } = event;
        handlers.onPreview?.(preview as TPreview);
      } else if (event.type === "done") {
        const { type: _type, ...payload } = event;
        result = payload as TDone;
      } else if (event.type === "error") {
        throw new AiStreamError(event.source ?? "error");
      }
    }
  }
  if (result === undefined) throw new Error("stream ended early");
  return result;
}
