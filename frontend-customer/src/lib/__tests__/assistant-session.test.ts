import { describe, expect, it } from "vitest";

import { decideLink, resolveSession } from "@/lib/assistant";

const HOUR = 60 * 60 * 1000;

describe("resolveSession", () => {
  it("keeps a fresh stored id", () => {
    const raw = JSON.stringify({ id: "abc", ts: 1000 });
    expect(resolveSession(raw, 1000 + HOUR)).toEqual({
      id: "abc",
      fresh: false,
    });
  });
  it("rotates after 24h idle", () => {
    const raw = JSON.stringify({ id: "abc", ts: 0 });
    const out = resolveSession(raw, 25 * HOUR);
    expect(out.fresh).toBe(true);
    expect(out.id).not.toBe("abc");
  });
  it("survives garbage", () => {
    expect(resolveSession("{not json", 0).fresh).toBe(true);
    expect(resolveSession(null, 0).fresh).toBe(true);
  });
});

describe("decideLink", () => {
  const ORIGIN = "https://coach.contentor.app";
  const WL = ["https://instagram.com/coach"];
  it("same-site paths are internal", () => {
    expect(decideLink("/store", ORIGIN, WL)).toBe("internal");
  });
  it("whitelisted https is external", () => {
    expect(decideLink("https://instagram.com/coach", ORIGIN, WL)).toBe(
      "external",
    );
  });
  it("everything else is dropped", () => {
    expect(decideLink("https://evil.com", ORIGIN, WL)).toBeNull();
    expect(decideLink("//evil.com", ORIGIN, WL)).toBeNull();
    expect(decideLink("/\\evil.com", ORIGIN, WL)).toBeNull();
  });
});
