import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LookCards } from "@/lib/setup-flow";
import { LookCardsView } from "../look-cards";

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

const LOGOS: LookCards = {
  kind: "logo",
  options: [{ value: "12", label: "Lotus", image_url: "http://x/12.png" }],
  style: "atelier",
  palette: "",
};
const renderLogos = (
  generated: LookCards["generated"],
  onLogoMore = async () => LOGOS,
) =>
  renderToStaticMarkup(
    createElement(LookCardsView, {
      cards: { ...LOGOS, generated },
      brandName: "Elara",
      disabled: false,
      onPick: () => {},
      onKeep: () => {},
      onMore: async () => LOGOS,
      onLogoMore,
    }),
  );

describe("LookCardsView generated logos", () => {
  it("shows ranked candidates above the curated grid when ready", () => {
    const html = renderLogos({
      state: "ready",
      options: [
        {
          value: "gen:2",
          label: "the name alone",
          image_url: "http://x/2.png",
          rank: 1,
        },
        {
          value: "gen:1",
          label: "a lotus face",
          image_url: "http://x/1.png",
          rank: 2,
        },
      ],
    });
    expect(html).toContain("Designed for you");
    expect(html.indexOf("http://x/2.png")).toBeLessThan(
      html.indexOf("http://x/1.png"),
    );
    expect(html.indexOf("http://x/2.png")).toBeLessThan(
      html.indexOf("http://x/12.png"),
    );
    expect(html).toContain("Three more");
  });

  it("shows the waiting state with the curated grid still available", () => {
    const html = renderLogos({ state: "building", options: [] });
    expect(html).toContain("Designing your logo");
    expect(html).toContain("http://x/12.png");
    expect(html).not.toContain("Three more");
  });

  it("renders nothing extra when there is no batch", () => {
    const html = renderLogos({ state: "none", options: [] });
    expect(html).not.toContain("Designed for you");
    expect(html).not.toContain("Designing your logo");
  });
});

describe("LookCardsView tag chips", () => {
  it("offers only tags the best-ranked looks carry", () => {
    const options = Array.from({ length: 10 }, (_, i) => ({
      ...look(`s${i}`, `g${i}`, i === 0),
      tags: i === 0 ? ["selling"] : i === 9 ? ["sexy"] : [],
    }));
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards: { kind: "style", options },
        brandName: "",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => ({ kind: "style", options }),
      }),
    );
    expect(html).toContain("Made to sell");
    expect(html).not.toContain("Sexy");
  });
  it("names a moody look in plain words", () => {
    const options = [{ ...look("nocturne", "g0", true), tags: ["sensual"] }];
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards: { kind: "style", options },
        brandName: "",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => ({ kind: "style", options }),
      }),
    );
    expect(html).toContain("Soft and moody");
    expect(html).not.toContain("Sensual");
  });
});
