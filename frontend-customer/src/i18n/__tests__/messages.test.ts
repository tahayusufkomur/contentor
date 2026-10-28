import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeMessages, missingFallback } from "@shared/i18n/locales";

afterEach(() => vi.restoreAllMocks());

describe("mergeMessages", () => {
  it("the language overrides English and English fills the gaps", () => {
    const en = { a: "A", b: "B" };
    expect(mergeMessages(en, { a: "Ä" })).toEqual({ a: "Ä", b: "B" });
  });
  it("merges nested paths key by key", () => {
    const en = { x: { y: "Y", z: { w: "W", v: "V" } } };
    expect(mergeMessages(en, { x: { z: { w: "Ẃ" } } })).toEqual({
      x: { y: "Y", z: { w: "Ẃ", v: "V" } },
    });
  });
  it("does not change its inputs", () => {
    const en = { x: { y: "Y" } };
    mergeMessages(en, { x: { y: "Ý" } });
    expect(en).toEqual({ x: { y: "Y" } });
  });
});

describe("missingFallback", () => {
  const en = { admin: { title: "Title", deep: { k: "Deep" } } };

  it("returns the English text, and logs once per locale and key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const e = { namespace: "admin", key: "title" };
    expect(missingFallback("tr", en, e)).toBe("Title");
    expect(missingFallback("tr", en, e)).toBe("Title");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("i18n: missing tr admin.title");
    missingFallback("de", en, e);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it("follows nested paths", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      missingFallback("pl", en, { namespace: "admin", key: "deep.k" }),
    ).toBe("Deep");
  });
  it("shows the path when English lacks the key too", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(missingFallback("tr", en, { namespace: "admin", key: "nope" })).toBe(
      "admin.nope",
    );
  });
});
