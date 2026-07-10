import { describe, expect, it } from "vitest";

import {
  isSameOriginPath,
  parseAnswer,
} from "@/components/admin/assistant/format-answer";

const ORIGIN = "https://coach.contentor.app";

describe("parseAnswer", () => {
  it("extracts a same-site link and strips it from the text", () => {
    const { text, links } = parseAnswer(
      "See the FAQ [here](/faq) for details.",
      ORIGIN,
    );
    expect(text).toBe("See the FAQ  for details.");
    expect(links).toEqual([{ label: "here", href: "/faq" }]);
  });

  it("strips bold markers", () => {
    const { text } = parseAnswer("This is **important**.", ORIGIN);
    expect(text).toBe("This is important.");
  });

  it("never matches a protocol-relative or off-site target (regression: security-review finding)", () => {
    // `//evil.com` is a protocol-relative URL — browsers resolve it as an
    // absolute off-site link (https://evil.com), not a same-site path. The
    // extraction regex rejects any href starting with a second slash, and
    // even if it didn't, isSameOriginPath would reject it too (see below).
    const { text, links } = parseAnswer(
      "Careful: [click here](//evil.com) looks like a link.",
      ORIGIN,
    );
    expect(links).toEqual([]);
    expect(text).toBe("Careful: [click here](//evil.com) looks like a link.");
  });

  it("still matches ordinary single-leading-slash paths after the fix", () => {
    const { links } = parseAnswer(
      "[Courses](/courses/yoga-basics) and [Store](/store) and [Home](/)",
      ORIGIN,
    );
    expect(links).toEqual([
      { label: "Courses", href: "/courses/yoga-basics" },
      { label: "Store", href: "/store" },
      { label: "Home", href: "/" },
    ]);
  });

  // Round 2 — the regex-tightening from round 1 blocked `//evil.com` but not
  // the equivalent backslash bypass. Real validation must go through the
  // WHATWG `URL` parser, not a character-class regex. All 7 cases from the
  // final review's required test matrix, run through the full parseAnswer
  // pipeline (extraction regex + isSameOriginPath origin check together).
  describe("origin validation (round 2: backslash bypass, full 7-case matrix)", () => {
    it("[a](/faq) -> ACCEPT, same-origin path", () => {
      const { links } = parseAnswer("[a](/faq)", ORIGIN);
      expect(links).toEqual([{ label: "a", href: "/faq" }]);
    });

    it("[a](/courses/yoga-basics) -> ACCEPT", () => {
      const { links } = parseAnswer("[a](/courses/yoga-basics)", ORIGIN);
      expect(links).toEqual([{ label: "a", href: "/courses/yoga-basics" }]);
    });

    it("[a](//evil.com) -> REJECT (round-1 bypass)", () => {
      const { links } = parseAnswer("[a](//evil.com)", ORIGIN);
      expect(links).toEqual([]);
    });

    it("[a](/\\evil.com) -> REJECT (round-2 bypass, survived round 1's regex tightening)", () => {
      // A backslash immediately after the leading slash is treated by the
      // WHATWG URL Standard exactly like a second slash for http/https
      // URLs ("special authority ignore slashes" state), so this resolves
      // to host `evil.com` in every real browser and in Node's URL class.
      const { links } = parseAnswer("[a](/\\evil.com)", ORIGIN);
      expect(links).toEqual([]);
    });

    it("[a](/\\/evil.com) -> REJECT", () => {
      const { links } = parseAnswer("[a](/\\/evil.com)", ORIGIN);
      expect(links).toEqual([]);
    });

    it("[a](https://evil.com) -> REJECT (doesn't match the leading-`/` extraction regex anyway)", () => {
      const { links } = parseAnswer("[a](https://evil.com)", ORIGIN);
      expect(links).toEqual([]);
    });

    it("[a](/) -> ACCEPT (bare root)", () => {
      const { links } = parseAnswer("[a](/)", ORIGIN);
      expect(links).toEqual([{ label: "a", href: "/" }]);
    });
  });
});

describe("isSameOriginPath", () => {
  it("accepts a same-origin path resolved against the given origin", () => {
    expect(isSameOriginPath("/faq", ORIGIN)).toBe(true);
    expect(isSameOriginPath("/", ORIGIN)).toBe(true);
  });

  it("rejects a protocol-relative href (round-1 bypass)", () => {
    expect(isSameOriginPath("//evil.com", ORIGIN)).toBe(false);
  });

  it("rejects the backslash bypass via real URL parsing (round-2 bypass)", () => {
    expect(isSameOriginPath("/\\evil.com", ORIGIN)).toBe(false);
    expect(isSameOriginPath("/\\/evil.com", ORIGIN)).toBe(false);
  });

  it("rejects an absolute off-site URL", () => {
    expect(isSameOriginPath("https://evil.com", ORIGIN)).toBe(false);
  });

  it("fails closed on an unparseable href or empty origin", () => {
    expect(isSameOriginPath("/faq", "")).toBe(false);
  });
});
