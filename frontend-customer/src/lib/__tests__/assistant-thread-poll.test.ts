import { describe, expect, it } from "vitest";

import { applyThreadPoll, type ThreadPayload } from "@/lib/assistant";

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
