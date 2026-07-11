import { afterEach, describe, expect, it, vi } from "vitest";

import { applyThreadPoll } from "@/lib/assistant";
import { fetchHelpThread } from "@/lib/help-bot";

// Regression coverage for the same review finding fixed in
// lib/assistant.ts's fetchThread (see assistant-thread-poll.test.ts), ported
// to the coach console's fetchHelpThread — which wraps clientFetch (throws
// an ApiError on any non-OK response) rather than reading `res.status`
// directly off a plain fetch Response.
function fetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    // clientFetch treats a "0" content-length as an empty body — only
    // matters for 204s, so return null for every other status here.
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe("fetchHelpThread", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a 404 (no conversation row yet) to an empty ThreadPayload, not null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(404, { detail: "Not found." })),
    );
    const result = await fetchHelpThread(0);
    expect(result).not.toBeNull();
    expect(result?.messages).toEqual([]);
    expect(result?.status).toBe("ai");
  });

  it("still resolves to null for a genuine failure (network error / 5xx)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    expect(await fetchHelpThread(0)).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(500, { detail: "boom" })),
    );
    expect(await fetchHelpThread(0)).toBeNull();
  });

  it("end-to-end: a fresh conversation's 404-then-real-message sequence does not duplicate the first exchange", async () => {
    let hydrated = false;
    let lastId = 0;

    // Tick 1: brand-new coach session, nothing sent yet — server 404s.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(404, { detail: "Not found." })),
    );
    const initial1 = !hydrated;
    const t1 = await fetchHelpThread(lastId);
    expect(t1).not.toBeNull(); // must NOT be null — that's the bug
    if (t1) {
      hydrated = true;
      const r1 = applyThreadPoll(t1, lastId, initial1);
      lastId = r1.lastId;
      expect(r1.appended).toEqual([]);
    }
    expect(hydrated).toBe(true);

    // Tick 2: the conversation now exists after send() persisted it.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fetchResponse(200, {
          session_id: "s1",
          status: "ai",
          agent_label: "",
          human_requested: false,
          messages: [
            { id: 1, role: "user", content: "hi", created_at: "" },
            { id: 2, role: "assistant", content: "hello!", created_at: "" },
          ],
        }),
      ),
    );
    const initial2 = !hydrated;
    expect(initial2).toBe(false); // correctly no longer "initial"
    const t2 = await fetchHelpThread(lastId);
    expect(t2).not.toBeNull();
    if (t2) {
      const r2 = applyThreadPoll(t2, lastId, initial2);
      expect(r2.appended).toEqual([]); // no duplicate bubbles
      lastId = r2.lastId;
    }
    expect(lastId).toBe(2);
  });

  it("returning session: a genuinely initial tick with real history still fully replays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fetchResponse(200, {
          session_id: "s1",
          status: "ai",
          agent_label: "",
          human_requested: false,
          messages: [
            { id: 1, role: "user", content: "old q", created_at: "" },
            { id: 2, role: "assistant", content: "old a", created_at: "" },
          ],
        }),
      ),
    );
    const t = await fetchHelpThread(0);
    expect(t).not.toBeNull();
    if (t) {
      const result = applyThreadPoll(t, 0, /* initial */ true);
      expect(result.appended.map((m) => m.id)).toEqual([1, 2]);
      expect(result.lastId).toBe(2);
    }
  });
});
