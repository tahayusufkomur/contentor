import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  activeTool,
  firstTool,
  openTool,
  StudioRail,
  type ToolState,
} from "@/components/studio/studio-rail";
import { STUDIO_TOOLS } from "@/lib/covers/routes";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(Intl, { locale: "en", messages }, node));

describe("openTool", () => {
  it("starts on Layouts, with Yours on the photo sources", () => {
    expect(firstTool).toEqual({ drawer: "layouts", photosTab: "yours" });
    expect(activeTool(firstTool)).toBe("layouts");
  });

  it("opens the drawer of a tool", () => {
    for (const tool of [
      "layouts",
      "text",
      "elements",
      "brand",
      "uploads",
    ] as const) {
      const next = openTool(firstTool, tool);
      expect(next.drawer).toBe(tool);
      expect(activeTool(next)).toBe(tool);
    }
  });

  it("opens Photos on the tab she was on", () => {
    const state: ToolState = { drawer: "text", photosTab: "contentor" };
    expect(openTool(state, "photos")).toEqual({
      drawer: "photos",
      photosTab: "contentor",
    });
  });

  it("opens Photos on its New tab for New photo, and lights New photo, not Photos", () => {
    const next = openTool(firstTool, "generate");
    expect(next).toEqual({ drawer: "photos", photosTab: "new" });
    expect(activeTool(next)).toBe("generate");
  });

  it("takes Photos off the New tab, which has its own button", () => {
    const onNew = openTool(firstTool, "generate");
    const photos = openTool(onNew, "photos");
    expect(photos).toEqual({ drawer: "photos", photosTab: "yours" });
    expect(activeTool(photos)).toBe("photos");
  });

  it("lights New photo when she switches to the New tab herself, and Photos when she leaves it", () => {
    const onYours = openTool(firstTool, "photos");
    expect(activeTool({ ...onYours, photosTab: "new" })).toBe("generate");
    expect(activeTool({ ...onYours, photosTab: "contentor" })).toBe("photos");
  });

  it("keeps the photo tab while another drawer is open (so New stays lit for nobody)", () => {
    const onNew = openTool(firstTool, "generate");
    const away = openTool(onNew, "brand");
    expect(away).toEqual({ drawer: "brand", photosTab: "new" });
    expect(activeTool(away)).toBe("brand");
  });
});

describe("StudioRail", () => {
  const rail = (active: (typeof STUDIO_TOOLS)[number] = "layouts") =>
    render(createElement(StudioRail, { active, onOpen: vi.fn() }));

  it("lists the seven tools in order, New photo last and set apart", () => {
    const markup = rail();
    const names = [
      ...markup.matchAll(
        /<button[^>]*>(?:<svg[\s\S]*?<\/svg>)([^<]*)<\/button>/g,
      ),
    ].map((m) => m[1]);
    expect(names).toEqual([
      "Layouts",
      "Photos",
      "Text",
      "Elements",
      "Brand",
      "Uploads",
      "New photo",
    ]);
    // a rule between Uploads and New photo
    expect(markup).toMatch(
      /Uploads<\/button><span aria-hidden="true"[^>]*><\/span><button/,
    );
  });

  it("is a navigation named for what it holds", () => {
    expect(rail()).toMatch(/<nav aria-label="Studio tools"/);
  });

  it("marks the lit tool pressed, and only it", () => {
    const markup = rail("brand");
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /aria-pressed="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)Brand/,
    );
  });
});
