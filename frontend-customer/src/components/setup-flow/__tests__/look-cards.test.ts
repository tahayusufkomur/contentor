import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { LookCards } from "@/lib/setup-flow";
import { LookCardsView } from "../look-cards";
import { renderToStaticMarkup } from "./intl";

const look = (value: string, group: string, recommended = false) => ({
  value,
  style: value,
  label: value,
  group,
  recommended,
});
const SPLIT = "Headline beside a photo";
const CARDS: LookCards = {
  kind: "style",
  options: [
    look("journal", SPLIT, true),
    look("kinetic", "Photo behind the headline"),
    look("grid", SPLIT),
    look("pop", SPLIT),
    look("darkroom", "Photo first, words second"),
  ],
};
const render = (props: { selected?: string } = {}) =>
  renderToStaticMarkup(
    createElement(LookCardsView, {
      cards: CARDS,
      brandName: "",
      disabled: false,
      onPick: () => {},
      onKeep: () => {},
      onMore: async () => CARDS,
      ...props,
    }),
  );

describe("LookCardsView style grouping", () => {
  it("leads with one look per hero layout, the twins behind More looks", () => {
    const html = render();
    for (const lead of ["journal", "kinetic", "darkroom"])
      expect(html).toContain(`>${lead}<`);
    expect(html).not.toContain(">grid<");
    expect(html).not.toContain(">pop<");
    expect(html).toContain("More looks (2)");
  });

  it("opens the group when the look picked before is one of the twins", () => {
    const html = render({ selected: "pop · Original" });
    expect(html).toContain(">pop<");
    expect(html).toContain("More looks: headline beside a photo");
  });
});

describe("LookCardsView tag chips", () => {
  it("offers only tags the best-ranked looks carry", () => {
    const options = Array.from({ length: 10 }, (_, i) => ({
      ...look(`s${i}`, `g${i}`, i === 0),
      tags: i === 0 ? ["selling"] : i === 9 ? ["sexy"] : [],
    }));
    const cards: LookCards = { kind: "style", options };
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards,
        brandName: "",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => cards,
      }),
    );
    expect(html).toContain("Made to sell");
    expect(html).not.toContain("Sexy");
  });
  it("names a moody look in plain words", () => {
    const options = [{ ...look("nocturne", "g0", true), tags: ["sensual"] }];
    const cards: LookCards = { kind: "style", options };
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards,
        brandName: "",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => cards,
      }),
    );
    expect(html).toContain("Soft and moody");
    expect(html).not.toContain("Sensual");
  });
});

describe("LookCardsView navbar studio", () => {
  it("renders layout presets, addable link chips, header toggles, and desktop/mobile preview", () => {
    const cards: LookCards = {
      kind: "navbar",
      options: [
        {
          value: "classic",
          label: "Classic",
          recommended: true,
          reason: "Matched to your Quiet Journal look.",
        },
        { value: "pill", label: "Floating pill" },
      ],
      links: [
        { label: "Courses", href: "/courses" },
        { label: "About", href: "/about" },
      ],
      available_links: [
        { label: "Courses", href: "/courses" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
        { label: "FAQ", href: "/faq" },
      ],
      socials: ["instagram", "youtube"],
      show_social: true,
      cta: "Get Started",
      show_cta: true,
      style: "journal",
    };
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards,
        brandName: "Maya Yoga",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => cards,
      }),
    );
    expect(html).toContain("Pages in your header menu");
    expect(html).toContain("Contact");
    expect(html).toContain("FAQ");
    // The header no longer carries social icons: the footer lists them.
    expect(html).not.toContain("Social icons");
    expect(html).toContain("Transparent over hero");
    expect(html).toContain("Mobile + Menu");
  });
});
