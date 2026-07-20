import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSessionId,
  shouldTrack,
  SESSION_HEADER,
} from "@shared/tracking/session";

describe("shouldTrack", () => {
  it("fires on first navigation", () => {
    expect(shouldTrack(null, "/courses", 1000)).toBe(true);
  });
  it("dedupes same path within 1s", () => {
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/courses", 1500)).toBe(
      false,
    );
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/courses", 2100)).toBe(
      true,
    );
  });
  it("fires immediately on a different path", () => {
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/about", 1001)).toBe(
      true,
    );
  });
});

describe("getSessionId", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-1111-1111-111111111111",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mints once and is stable per tab", () => {
    const first = getSessionId();
    expect(first).toBe("11111111-1111-1111-1111-111111111111");
    expect(getSessionId()).toBe(first);
  });

  it("returns empty string on the server (no window)", () => {
    vi.unstubAllGlobals(); // node env has no window global
    expect(getSessionId()).toBe("");
  });

  it("returns empty string when storage is blocked", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("storage blocked");
        },
        setItem: () => {
          throw new Error("storage blocked");
        },
      },
    });
    expect(getSessionId()).toBe("");
  });

  it("exports the header name", () => {
    expect(SESSION_HEADER).toBe("X-Session-Id");
  });
});
