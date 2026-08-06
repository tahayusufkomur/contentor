import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearEntries,
  loadEntries,
  PERSIST_MAX,
  persistableEntries,
  saveEntries,
} from "@/lib/copilot/storage";
import type { ChatEntry } from "@/lib/copilot/types";

function stubStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

const entry = (i: number, over: Partial<ChatEntry> = {}): ChatEntry => ({
  role: i % 2 ? "assistant" : "coach",
  text: `message ${i}`,
  ...over,
});

describe("persistableEntries", () => {
  it("caps at the last PERSIST_MAX entries", () => {
    const many = Array.from({ length: PERSIST_MAX + 10 }, (_, i) => entry(i));
    const kept = persistableEntries(many);
    expect(kept).toHaveLength(PERSIST_MAX);
    expect(kept[kept.length - 1].text).toBe(`message ${PERSIST_MAX + 9}`);
  });

  it("strips action cards (their tokens are single-use) but keeps kind", () => {
    const withCard = entry(1, {
      kind: "actions",
      cards: [{ kind: "add_block", title: "t", detail: "", token: "x" }],
    });
    const [kept] = persistableEntries([withCard]);
    expect(kept).toEqual({
      role: "assistant",
      text: "message 1",
      kind: "actions",
    });
    expect("cards" in kept).toBe(false);
  });
});

describe("saveEntries / loadEntries / clearEntries", () => {
  it("round-trips a conversation", () => {
    stubStorage();
    saveEntries([entry(0), entry(1)]);
    expect(loadEntries()).toEqual([
      { role: "coach", text: "message 0" },
      { role: "assistant", text: "message 1" },
    ]);
    clearEntries();
    expect(loadEntries()).toEqual([]);
  });

  it("returns [] on corrupted or foreign stored values", () => {
    stubStorage({ "copilot:transcript:v1": "{not json" });
    expect(loadEntries()).toEqual([]);
    stubStorage({ "copilot:transcript:v1": JSON.stringify({ nope: 1 }) });
    expect(loadEntries()).toEqual([]);
    stubStorage({
      "copilot:transcript:v1": JSON.stringify([
        { role: "coach", text: "ok" },
        { role: "hacker", text: "dropped" },
        { role: "assistant" },
      ]),
    });
    expect(loadEntries()).toEqual([{ role: "coach", text: "ok" }]);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("full");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadEntries()).toEqual([]);
    expect(() => saveEntries([entry(0)])).not.toThrow();
    expect(() => clearEntries()).not.toThrow();
  });
});
