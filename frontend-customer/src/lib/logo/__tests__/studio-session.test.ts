import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRecipe } from "@/lib/logo/catalog";
import type { Brief } from "@/lib/logo/composer";
import {
  clearStudioSession,
  loadStudioSession,
  saveStudioSession,
} from "@/lib/logo/studio-session";

const BRIEF: Brief = { brandName: "Zeynep Yoga", niche: "yoga", styleChips: [] };
const RECIPE = defaultRecipe("Zeynep Yoga", "#1a56db");
const KEY = "contentor_logo_studio";

// No jsdom in this project (pure-logic tests only, per vitest.config.ts) —
// stand in for the browser's localStorage with a minimal in-memory Map.
class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const fakeLocalStorage = new FakeLocalStorage();
vi.stubGlobal("localStorage", fakeLocalStorage);
// studio-session.ts guards every function with `typeof window === "undefined"`
// (SSR safety) — stub it so these tests exercise the real logic, not the guard.
vi.stubGlobal("window", {});

describe("studio-session", () => {
  beforeEach(() => {
    fakeLocalStorage.clear();
  });

  it("returns null when nothing is saved", () => {
    expect(loadStudioSession()).toBeNull();
  });

  it("round-trips a saved session", () => {
    saveStudioSession({
      step: "editor",
      brief: BRIEF,
      wallSeed: 42,
      pack: null,
      packSeed: null,
      recipe: RECIPE,
      elements: null,
    });
    const loaded = loadStudioSession();
    expect(loaded?.step).toBe("editor");
    expect(loaded?.brief).toEqual(BRIEF);
    expect(loaded?.wallSeed).toBe(42);
    expect(loaded?.recipe).toEqual(RECIPE);
  });

  it("discards a session from a different schema version", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 999, savedAt: Date.now(), step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).toBeNull();
  });

  it("discards a session older than 14 days", () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: fifteenDaysAgo, step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).toBeNull();
  });

  it("keeps a session younger than 14 days", () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: tenDaysAgo, step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).not.toBeNull();
  });

  it("tolerates corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadStudioSession()).toBeNull();
  });

  it("tolerates a missing/malformed shape", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now() }));
    expect(loadStudioSession()).toBeNull();
  });

  it("clear removes the saved session", () => {
    saveStudioSession({ step: "brief", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: null, elements: null });
    clearStudioSession();
    expect(loadStudioSession()).toBeNull();
  });

  it("never throws when localStorage.setItem throws (quota exceeded)", () => {
    const spy = vi.spyOn(fakeLocalStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() =>
      saveStudioSession({ step: "brief", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: null, elements: null }),
    ).not.toThrow();
    spy.mockRestore();
  });
});
