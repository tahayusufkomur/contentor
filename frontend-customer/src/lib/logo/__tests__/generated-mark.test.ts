import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import { LogoRenderer, MarkRenderer } from "@shared/logo/logo-renderer";
import type { LogoRecipe } from "@/types/logo";

const recipe: LogoRecipe = {
  version: 3,
  layout: "horizontal",
  name: "Elara",
  tagline: "",
  mark: {
    type: "generated",
    view_box: [100, 50],
    name_in_mark: true,
    paths: [
      { d: "M2 2L98 2L98 48Z", role: "primary" },
      { d: "M10 10L20 10L20 20Z", role: "ink", fill_rule: "evenodd" },
    ],
  },
  badge: { shape: "none", outline: false },
  typography: {
    name: { font: "Inter", weight: 700, tracking: 0, case: "none" },
    tagline: { font: "Inter", weight: 500, tracking: 0.08, case: "upper" },
  },
  colors: {
    palette_id: null,
    badge: { type: "solid", color: "#ffffff" },
    mark: "#8c4451",
    text: "#3f2a2b",
    tagline: "#7a5f60",
    roles: { primary: "#8c4451", ink: "#3f2a2b" },
  },
  elements: {
    mark: { offset: [0, 0], scale: 1 },
    name: { offset: [0, 0], scale: 1 },
    tagline: { offset: [0, 0], scale: 1 },
  },
};

describe("generated mark", () => {
  it("migrates through untouched", () => {
    expect(isRecipe(recipe)).toBe(true);
    expect(migrateRecipe(recipe)).toEqual(recipe);
  });

  it("renders paths in role colours and no name when the name is in the mark", () => {
    const html = renderToStaticMarkup(createElement(LogoRenderer, { recipe }));
    expect(html).toContain('fill="#8c4451"');
    expect(html).toContain('fill="#3f2a2b"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain('data-part="name"');
    expect(html).toContain('viewBox="0 0 640 200"');
  });

  it("draws the name when name_in_mark is false", () => {
    const r = {
      ...recipe,
      mark: { ...recipe.mark, name_in_mark: false },
    } as LogoRecipe;
    expect(
      renderToStaticMarkup(createElement(LogoRenderer, { recipe: r })),
    ).toContain('data-part="name"');
  });

  it("square mark render uses the paths, not initials", () => {
    const html = renderToStaticMarkup(createElement(MarkRenderer, { recipe }));
    expect(html).toContain("M2 2L98 2L98 48Z");
    expect(html).not.toContain("<text");
  });

  it("falls back to colors.mark for a role without a colour", () => {
    const r = {
      ...recipe,
      colors: { ...recipe.colors, roles: {} },
    } as LogoRecipe;
    expect(
      renderToStaticMarkup(createElement(LogoRenderer, { recipe: r })),
    ).toContain('fill="#8c4451"');
  });
});
