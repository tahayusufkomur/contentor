import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRun, pollDelay, type RunState } from "@/lib/copilot/runs";
import { pendingEntry, resolveRun, toTranscript } from "@/lib/copilot/state";
import type { ChatEntry, RunDetail } from "@/lib/copilot/types";
import { ApiError } from "@/types/api";

vi.mock("@/lib/copilot/api", () => ({ fetchRun: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

const detail = (over: Partial<RunDetail> = {}): RunDetail => ({
  id: 7,
  status: "thinking",
  specialist: "finance",
  chat: 3,
  seen: false,
  events: [],
  ...over,
});

const ev = (seq: number, type: string, data: Record<string, unknown> = {}) => ({
  seq,
  type,
  data,
  at: "2026-10-17T00:00:00Z",
});

const reply = {
  kind: "answer" as const,
  text: "Up 12%",
  specialist: "finance" as const,
};

const notes = { stopped: "Stopped.", failed: "That didn't work." };

const state = (over: Partial<RunState> = {}): RunState => ({
  id: 7,
  status: "done",
  specialist: "finance",
  chat: 3,
  lastSeq: 3,
  reply,
  ...over,
});

/** The store keeps module state; each test gets its own copy. */
async function freshStore() {
  vi.resetModules();
  const api = await import("@/lib/copilot/api");
  const store = await import("@/lib/copilot/runs");
  const fetchRun = vi.mocked(api.fetchRun);
  fetchRun.mockReset();
  return { store, fetchRun };
}

describe("applyRun", () => {
  it("merges events after lastSeq and ignores repeats", () => {
    const first = applyRun(undefined, detail({ events: [ev(1, "thinking")] }));
    expect(first.lastSeq).toBe(1);
    const again = applyRun(
      first,
      detail({ events: [ev(1, "thinking"), ev(2, "thinking")] }),
    );
    expect(again.lastSeq).toBe(2);
    expect(again.reply).toBeUndefined();
  });

  it("takes the reply payload and the terminal status", () => {
    const done = applyRun(
      undefined,
      detail({
        status: "done",
        events: [
          ev(1, "thinking"),
          ev(2, "reply", { payload: reply }),
          ev(3, "done"),
        ],
      }),
    );
    expect(done.status).toBe("done");
    expect(done.reply).toEqual(reply);
    expect(done.lastSeq).toBe(3);
  });
});

describe("pollDelay", () => {
  it("backs off and caps at 10 s", () => {
    expect([0, 1, 2, 3, 4, 9].map(pollDelay)).toEqual([
      700, 1500, 3000, 6000, 10000, 10000,
    ]);
  });
});

describe("resolveRun", () => {
  it("replaces only its own pending entry", () => {
    const other: ChatEntry[] = [
      { role: "coach", text: "x" },
      pendingEntry(8, "content"),
    ];
    expect(resolveRun(other, state(), notes)).toBe(other);

    const mine: ChatEntry[] = [
      { role: "coach", text: "How are sales?" },
      pendingEntry(7, "finance"),
    ];
    const next = resolveRun(mine, state(), notes);
    expect(next[0]).toBe(mine[0]);
    expect(next[1]).toEqual({
      role: "assistant",
      text: "Up 12%",
      kind: "answer",
      specialist: "finance",
      run: 7,
    });
  });

  it("turns a stopped or failed run into a short note", () => {
    const entries = [pendingEntry(7, "finance")];
    expect(
      resolveRun(
        entries,
        state({ status: "stopped", reply: undefined }),
        notes,
      )[0],
    ).toEqual({
      role: "assistant",
      text: "Stopped.",
      kind: "stopped",
      specialist: "finance",
      run: 7,
    });
    expect(
      resolveRun(
        entries,
        state({ status: "failed", reply: undefined }),
        notes,
      )[0].kind,
    ).toBe("failed");
    expect(
      resolveRun(
        entries,
        state({ status: "thinking", reply: undefined }),
        notes,
      ),
    ).toBe(entries);
  });
});

describe("toTranscript", () => {
  it("leaves out pending, stopped and failed notes", () => {
    const entries: ChatEntry[] = [
      { role: "coach", text: "a" },
      { role: "assistant", text: "Stopped.", kind: "stopped", run: 1 },
      { role: "coach", text: "b" },
      { role: "assistant", text: "That didn't work.", kind: "failed", run: 2 },
      { role: "coach", text: "c" },
      pendingEntry(3, "finance"),
    ];
    expect(toTranscript(entries).map((e) => e.text)).toEqual(["a", "b", "c"]);
  });
});

describe("the run store", () => {
  it("fetches each active run once per tick and nothing while hidden", async () => {
    const { store, fetchRun } = await freshStore();
    vi.stubGlobal("document", { visibilityState: "hidden" });
    store.trackRun(1, "finance");
    store.trackRun(2, "content");
    await store.tick();
    expect(fetchRun).not.toHaveBeenCalled();

    vi.stubGlobal("document", { visibilityState: "visible" });
    fetchRun.mockImplementation(async (id: number) =>
      detail({ id, events: [ev(1, "thinking")] }),
    );
    await store.tick();
    expect(fetchRun.mock.calls).toEqual([
      [1, 0],
      [2, 0],
    ]);
    await store.tick();
    expect(fetchRun.mock.calls.slice(2)).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it("tells who is listening when a run finishes, once", async () => {
    const { store, fetchRun } = await freshStore();
    const finished = vi.fn();
    store.onRunFinished(finished);
    store.trackRun(7, "finance");
    fetchRun.mockResolvedValue(
      detail({
        status: "done",
        events: [ev(1, "reply", { payload: reply }), ev(2, "done")],
      }),
    );
    await store.tick();
    await store.tick();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0]).toMatchObject({
      id: 7,
      status: "done",
      reply,
    });
    expect(fetchRun).toHaveBeenCalledTimes(1);
  });

  it("gives up on a run the server no longer has", async () => {
    const { store, fetchRun } = await freshStore();
    store.trackRun(9, "finance");
    fetchRun.mockRejectedValue(new ApiError(404, { detail: "not_found" }));
    await store.tick();
    await store.tick();
    expect(fetchRun).toHaveBeenCalledTimes(1);
  });
});
