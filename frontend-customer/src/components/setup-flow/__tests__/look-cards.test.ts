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
