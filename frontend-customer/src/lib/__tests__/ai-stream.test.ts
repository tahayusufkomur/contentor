import { afterEach, describe, expect, it, vi } from "vitest";

import { AiStreamError, isAbortError, streamAi } from "@/lib/ai-stream";

/** Build a Response whose body streams `chunks` verbatim, so tests can split
 * SSE frames at arbitrary byte boundaries. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function mockFetch(res: Response) {
  const spy = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamAi", () => {
  it("reports phases and previews, then resolves with the done payload", async () => {
    mockFetch(
      sseResponse([
        frame({ type: "phase", phase: "preparing" }),
        frame({ type: "phase", phase: "drafting" }),
        frame({ type: "preview", title: "Habits", headings: ["Intro"] }),
        frame({ type: "done", post: { id: 7 }, source: "ai", remaining: 3 }),
      ]),
    );
    const phases: string[] = [];
    const previews: unknown[] = [];

    const result = await streamAi<{ source: string; remaining: number }>(
      "/api/v1/admin/blog/generate/",
      { custom_topic: "habits" },
      {
        onPhase: (p) => phases.push(p),
        onPreview: (p) => previews.push(p),
      },
    );

    expect(phases).toEqual(["preparing", "drafting"]);
    expect(previews).toEqual([{ title: "Habits", headings: ["Intro"] }]);
    // `type` is stripped so the payload matches the non-streaming shape.
    expect(result).toEqual({ post: { id: 7 }, source: "ai", remaining: 3 });
  });

  it("reassembles frames split across chunk boundaries", async () => {
    // The reader must not assume a chunk contains whole frames — a 3000-token
    // draft's frames routinely straddle TCP reads.
    const whole =
      frame({ type: "phase", phase: "drafting" }) +
      frame({ type: "done", source: "ai" });
    const mid = Math.floor(whole.length / 2);
    mockFetch(sseResponse([whole.slice(0, mid), whole.slice(mid)]));
    const phases: string[] = [];

    const result = await streamAi<{ source: string }>(
      "/x",
      {},
      { onPhase: (p) => phases.push(p) },
    );

    expect(phases).toEqual(["drafting"]);
    expect(result).toEqual({ source: "ai" });
  });

  it("returns the plain-JSON body when the server gates before streaming", async () => {
    // Quota/budget/disabled are decided before the stream opens, so the
    // server answers 200 + JSON. Callers branch on `source` either way.
    mockFetch(
      new Response(
        JSON.stringify({ post: null, source: "quota_exhausted", remaining: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await streamAi<{ source: string }>("/x", {});

    expect(result.source).toBe("quota_exhausted");
  });

  it("throws AiStreamError carrying the source on an error frame", async () => {
    mockFetch(
      sseResponse([
        frame({ type: "phase", phase: "drafting" }),
        frame({ type: "error", source: "error" }),
      ]),
    );

    await expect(streamAi("/x", {})).rejects.toBeInstanceOf(AiStreamError);
  });

  it("throws when the stream ends without a done frame", async () => {
    // A truncated stream must not look like success — the coach would get a
    // silently empty result.
    mockFetch(sseResponse([frame({ type: "phase", phase: "drafting" })]));

    await expect(streamAi("/x", {})).rejects.toThrow("stream ended early");
  });

  it("sends the SSE Accept header so the server negotiates streaming", async () => {
    const spy = mockFetch(sseResponse([frame({ type: "done", source: "ai" })]));

    await streamAi("/x", { a: 1 });

    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Accept).toBe(
      "text/event-stream",
    );
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("propagates the abort signal to fetch", async () => {
    const controller = new AbortController();
    const spy = mockFetch(sseResponse([frame({ type: "done", source: "ai" })]));

    await streamAi("/x", {}, {}, controller.signal);

    expect((spy.mock.calls[0][1] as RequestInit).signal).toBe(
      controller.signal,
    );
  });

  it("raises on a non-ok response", async () => {
    mockFetch(new Response("nope", { status: 500 }));

    await expect(streamAi("/x", {})).rejects.toThrow("request failed (500)");
  });
});

describe("isAbortError", () => {
  it("recognises an abort so cancelling is not reported as a failure", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("does not swallow real errors", () => {
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(new AiStreamError("error"))).toBe(false);
  });
});
