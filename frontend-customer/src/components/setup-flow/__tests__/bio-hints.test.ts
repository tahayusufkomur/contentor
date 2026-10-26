import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BIO_GUIDE, BIO_SHORT_WORDS, bioIsShort } from "@shared/lib/bio-guide";
import { BioHints, BioNudge } from "../bio-hints";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("bioIsShort", () => {
  it("nudges a bio that has started but is thin, never an empty or a full one", () => {
    expect(bioIsShort("")).toBe(false);
    expect(bioIsShort("   \n ")).toBe(false);
    expect(bioIsShort("I teach yoga")).toBe(true);
    expect(bioIsShort(words(BIO_SHORT_WORDS - 1))).toBe(true);
    expect(bioIsShort(words(BIO_SHORT_WORDS))).toBe(false);
  });

  it("holds an example that is itself long enough, and no creator-as-teacher wording", () => {
    expect(bioIsShort(BIO_GUIDE.example)).toBe(false);
    const copy = JSON.stringify(BIO_GUIDE).toLowerCase();
    expect(copy).not.toMatch(/teacher|coach|instructor/);
  });
});

describe("BioHints and BioNudge", () => {
  it("lists what to write, says why, and keeps the example closed until asked", () => {
    const html = renderToStaticMarkup(createElement(BioHints));
    expect(html).toContain(
      "The more you tell us, the more your site sounds like you",
    );
    for (const point of BIO_GUIDE.includes) expect(html).toContain(point);
    expect(html).toContain("See an example");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("vinyasa");
  });

  it("shows the nudge only for a short bio", () => {
    const nudge = (text: string) =>
      renderToStaticMarkup(createElement(BioNudge, { text }));
    expect(nudge("I teach yoga")).toContain("A few more lines");
    expect(nudge("")).toBe("");
    expect(nudge(words(60))).toBe("");
  });
});
