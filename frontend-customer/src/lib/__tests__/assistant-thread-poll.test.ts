import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyThreadPoll,
  fetchThread,
  type ThreadPayload,
} from "@/lib/assistant";

function thread(messages: ThreadPayload["messages"]): ThreadPayload {
  return {
    session_id: "s1",
    status: "ai",
    agent_label: "",
    human_requested: false,
    messages,
  };
}

describe("applyThreadPoll", () => {
  it("does not duplicate the first exchange once it lands on the server", () => {
    // Regression for a review finding: a brand-new conversation's first
    // tick finds an empty thread (nothing sent yet). If "have I hydrated"
    // were derived from lastId === 0, it would still read as "initial" on
    // the NEXT tick too (lastId never advanced), causing the just-sent
    // first Q&A — already a local echo from send() — to be replayed again
    // once the server has persisted it.
    const t1 = thread([]);
    const first = applyThreadPoll(t1, 0, /* initial */ true);
    expect(first.appended).toEqual([]);
    expect(first.lastId).toBe(0);

    // Between tick 1 and tick 2, the widget hydrates (hydratedRef flips to
    // true regardless of the empty result) and the user sends their first
    // message locally. The next tick is correctly no longer "initial".
    const t2 = thread([
      { id: 1, role: "user", content: "hi", created_at: "" },
      { id: 2, role: "assistant", content: "hello!", created_at: "" },
    ]);
    const second = applyThreadPoll(t2, first.lastId, /* initial */ false);
    expect(second.appended).toEqual([]); // no duplicate bubbles
    expect(second.lastId).toBe(2); // high-water mark still advances
  });

  it("replays the full history on a genuinely initial tick (returning session)", () => {
    const t = thread([
      { id: 1, role: "user", content: "old q", created_at: "" },
      { id: 2, role: "assistant", content: "old a", created_at: "" },
    ]);
    const result = applyThreadPoll(t, 0, /* initial */ true);
    expect(result.appended.map((m) => m.id)).toEqual([1, 2]);
    expect(result.lastId).toBe(2);
  });

  it("appends only agent/system rows on non-initial ticks", () => {
    const t = thread([
      { id: 3, role: "user", content: "already echoed", created_at: "" },
      { id: 4, role: "agent", content: "hi, this is Sam", created_at: "" },
      { id: 5, role: "system", content: "agent_joined:Sam", created_at: "" },
    ]);
    const result = applyThreadPoll(t, 2, /* initial */ false);
    expect(result.appended.map((m) => m.id)).toEqual([4, 5]);
    expect(result.lastId).toBe(5);
  });

  it("holds the high-water mark steady when there is nothing new", () => {
    const result = applyThreadPoll(thread([]), 5, false);
    expect(result.appended).toEqual([]);
    expect(result.lastId).toBe(5);
  });
});

function fetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

describe("fetchThread", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a 404 (no conversation row yet) to an empty ThreadPayload, not null", async () => {
    // Regression for the bug found in Task 18's review: a brand-new
    // conversation's very first poll tick genuinely 404s server-side (see
    // apps/tenant_config/assistant_views.py::assistant_thread), which used
    // to collapse into the same `null` used for real network/5xx failures.
    // That left hydratedRef stuck false past the always-404 first tick, so
    // the next tick to actually succeed was wrongly treated as "initial"
    // and replayed the first Q&A a second time on top of its local echo.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(404, { detail: "Not found." })),
    );
    const result = await fetchThread(0);
    expect(result).not.toBeNull();
    expect(result?.messages).toEqual([]);
    expect(result?.status).toBe("ai");
  });

  it("still resolves to null for a genuine failure (network error / 5xx)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    expect(await fetchThread(0)).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(500, { detail: "boom" })),
    );
    expect(await fetchThread(0)).toBeNull();
  });

  it("end-to-end: a fresh conversation's 404-then-real-message sequence does not duplicate the first exchange", async () => {
    // Same scenario as the pure-reducer test above, but driven through the
    // real fetchThread() so the 404-mapping fix is exercised, not just
    // applyThreadPoll in isolation.
    let hydrated = false;
    let lastId = 0;

    // Tick 1: brand-new session, nothing sent yet — server 404s.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fetchResponse(404, { detail: "Not found." })),
    );
    const initial1 = !hydrated;
    const t1 = await fetchThread(lastId);
    expect(t1).not.toBeNull(); // must NOT be null — that's the bug
    if (t1) {
      hydrated = true;
      const r1 = applyThreadPoll(t1, lastId, initial1);
      lastId = r1.lastId;
      expect(r1.appended).toEqual([]);
    }
    expect(hydrated).toBe(true);

    // Between ticks: user sends their first message. send() locally echoes
    // it AND the POST creates the conversation row + persists both rows
    // server-side.
    // Tick 2: the conversation now exists — fetchThread succeeds for real.
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
    const t2 = await fetchThread(lastId);
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
    const t = await fetchThread(0);
    expect(t).not.toBeNull();
    if (t) {
      const result = applyThreadPoll(t, 0, /* initial */ true);
      expect(result.appended.map((m) => m.id)).toEqual([1, 2]);
      expect(result.lastId).toBe(2);
    }
  });
});
