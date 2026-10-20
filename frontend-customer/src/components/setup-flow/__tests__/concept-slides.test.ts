import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import admin from "../../../../messages/en/admin.json";
import type { Slide } from "@/lib/setup-flow";
import { ConceptSlides, passesSlide } from "../concept-slides";
import { SlidePicture } from "../slide-pictures";

const slide = (over: Partial<Slide>): Slide => ({
  key: "team",
  by: "assistant",
  first: true,
  chapter: "Welcome",
  title: "You're not doing this alone.",
  body: "Body.",
  next: "Let's start",
  picture: {},
  ...over,
});
const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: { admin: typeof admin };
  children?: ReactNode;
}>;
const render = (slides: Slide[]) =>
  renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", messages: { admin } },
      createElement(ConceptSlides, {
        slides,
        brandName: "Glow",
        onPass: () => {},
      }),
    ),
  );

describe("ConceptSlides", () => {
  it("opens with the presenter, her job on a first slide, and the team's skip", () => {
    const html = render([slide({})]);
    expect(html).toContain('aria-roledescription="slide"');
    expect(html).toContain(">Assistant<");
    expect(html).toContain(admin.team.specialists.assistant.job);
    expect(html).toContain("Skip the introductions");
    expect(html).toContain("Let&#x27;s start");
  });

  it("says I know this on any other slide, names the name only after the first, and counts the deck", () => {
    const html = render([
      slide({ key: "pay", by: "finance", first: false, next: "Choose yours" }),
      slide({ key: "membership", by: "finance", first: false }),
    ]);
    expect(html).toContain("I know this");
    expect(html).not.toContain(admin.team.specialists.finance.job);
    expect(html).toContain("Slide 1 of 2");
  });

  it("draws nothing for an unknown picture", () => {
    const html = renderToStaticMarkup(
      createElement(SlidePicture, { slide: slide({ key: "nope" }) }),
    );
    expect(html).toBe("");
  });
});

describe("passesSlide", () => {
  const on = (tag: string) => ({
    closest: (sel: string) => (sel.split(", ").includes(tag) ? {} : null),
  });
  const press = (key: string, target: ReturnType<typeof on> | null) =>
    passesSlide({
      key,
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      repeat: false,
      target: target as unknown as EventTarget | null,
    });

  it("passes on Enter or the right arrow when focus is on the page", () => {
    expect(press("Enter", on("div"))).toBe(true);
    expect(press("ArrowRight", on("div"))).toBe(true);
  });

  it("leaves a focused button alone, so the arrow never turns a skip into seen", () => {
    expect(press("ArrowRight", on("button"))).toBe(false);
    expect(press("Enter", on("button"))).toBe(false);
  });

  it("does nothing while typing or on other keys", () => {
    expect(press("ArrowRight", on("input"))).toBe(false);
    expect(press("a", on("div"))).toBe(false);
  });
});
