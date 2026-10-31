import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";
import { STYLE_SECTIONS, resolveSection } from "../registry";
import { shouldPlay } from "../neutral/loop-video";
import { statementSize } from "../neutral/statement";
import {
  SECTION_BLOCK_DEFS,
  sectionDefaultData,
} from "@/lib/blocks/section-defs";
import type { Block } from "@/types/tenant";
import { withIntl } from "./with-intl";

const FAMILIES = ["proof", "statement", "video"] as const;
const editable = { onTextChange: () => {} };

function render(family: string, fields: Partial<Block>, edit = false) {
  const Comp = resolveSection(STYLE_SECTIONS, family, "journal.neutral");
  if (!Comp) throw new Error(`no ${family} layout`);
  const block = { id: "b", type: `section.${family}`, ...fields } as Block;
  return renderToStaticMarkup(
    withIntl(
      createElement(Comp, { block, editable: edit ? editable : undefined }),
    ),
  );
}

describe("proof, statement and video", () => {
  it("every style resolves them to its neutral layout", () => {
    for (const [id, style] of Object.entries(SITE_STYLES)) {
      for (const family of FAMILIES) {
        expect(style.variants[family], `${id} ${family}`).toContain("neutral");
        expect(
          resolveSection(STYLE_SECTIONS, family, `${id}.neutral`),
          `${id} ${family}`,
        ).toBeTruthy();
      }
    }
  });

  it("proof renders nothing on the public site when empty", () => {
    const html = render("proof", {
      heading: "In their words",
      quotes: [{ quote: " ", name: "Ana" }],
      numbers: [{ value: "12", label: "" }],
      press: [{ name: "" }],
    });
    expect(html).toBe("");
  });

  it("proof shows a nameless quote without attribution", () => {
    const nameless = render("proof", {
      quotes: [{ quote: "I sleep better." }],
    });
    expect(nameless).toContain("“I sleep better.”");
    expect(nameless).not.toContain("<figcaption");
    const named = render("proof", {
      quotes: [{ quote: "I sleep better.", name: "Ana" }],
    });
    expect(named).toMatch(/<figcaption[^>]*>Ana<\/figcaption>/);
  });

  it("proof shows her numbers and press only when complete", () => {
    const html = render("proof", {
      numbers: [
        { value: "300", label: "students taught" },
        { value: "9", label: "" },
      ],
      press: [{ name: "Yoga Journal" }],
    });
    expect(html).toContain("300");
    expect(html).toContain("students taught");
    expect(html).not.toContain(">9<");
    expect(html).toContain("In the press");
    expect(html).toContain("Yoga Journal");
  });

  it("proof in the editor says it stays hidden", () => {
    expect(render("proof", {}, true)).toContain("stays hidden");
  });

  it("statement drops caps over 24 characters", () => {
    expect(render("statement", { statement: "Breathe first." })).not.toContain(
      "normal-case",
    );
    expect(
      render("statement", { statement: "Rest is part of the practice." }),
    ).toContain("normal-case");
    expect(render("statement", {})).toBe("");
  });

  it("statement fits its longest word on a phone", () => {
    // "Unapologetically": 16 characters at 0.7em each
    expect(statementSize("Unapologetically")).toBe(
      "min(clamp(3.5rem, 1rem + 10vw, 11rem), calc((100vw - 3rem) / 11.20))",
    );
    expect(render("statement", { statement: "Unapologetically" })).toContain(
      "calc((100vw - 3rem) / 11.20)",
    );
  });

  it("video renders nothing without a clip it can loop; vertical is 9:16", () => {
    expect(render("video", { heading: "A minute in class" })).toBe("");
    expect(
      render("video", {
        video: { url: "https://youtu.be/abc", video_id: null },
      }),
    ).toBe("");
    const html = render("video", {
      video: {
        url: "https://cdn/clip.mp4?sig=1",
        video_id: 4,
        poster: "p.jpg",
      },
      shape: "vertical",
    });
    expect(html).toContain("aspect-[9/16]");
    expect(html).toContain('poster="p.jpg"');
    expect(html).not.toContain("autoplay");
    expect(html).toContain('aria-label="Play video"');
  });

  it("the editor offers her clip, her clients' words and a line she believes", () => {
    const field = (type: string, key: string) =>
      SECTION_BLOCK_DEFS[`section.${type}`].fields.find((f) => f.key === key);
    expect(field("video", "video")?.type).toBe("video");
    expect(field("video", "shape")?.type).toBe("select");
    expect(field("proof", "quotes")?.type).toBe("repeater");
    expect(field("proof", "quotes")?.helpText).toMatch(/really said/);
    expect(sectionDefaultData("statement", "journal")).toMatchObject({
      variant: "journal.neutral",
      statement: "One line you believe.",
    });
    expect(sectionDefaultData("proof", "kinetic")).toEqual({
      variant: "kinetic.neutral",
      heading: "In their words",
    });
  });

  it("the editor says why a page link is no clip", () => {
    const html = render(
      "video",
      { video: { url: "https://youtu.be/abc", video_id: null } },
      true,
    );
    expect(html).toContain("This link cannot loop");
  });

  it("long names and attributions are not set in capitals", () => {
    const long = "Maya Laurent and the Tuesday group";
    expect(
      render("statement", { statement: "Rest.", attribution: long }),
    ).toMatch(/!normal-case[^"]*">Maya Laurent and the Tuesday group/);
    expect(
      render("proof", { quotes: [{ quote: "Calmer.", name: long }] }),
    ).toMatch(/!normal-case[^"]*">Maya Laurent and the Tuesday group/);
  });

  it("autoplay waits for motion, sight and the visitor", () => {
    const at = (
      reducedMotion: boolean,
      visible: boolean,
      choice: "auto" | "play" | "pause",
    ) => shouldPlay({ reducedMotion, visible, choice });
    expect(at(false, true, "auto")).toBe(true);
    expect(at(true, true, "auto")).toBe(false);
    expect(at(false, false, "auto")).toBe(false);
    expect(at(false, true, "pause")).toBe(false);
    expect(at(true, true, "play")).toBe(true); // her own tap wins over reduced motion
    expect(at(true, false, "play")).toBe(false); // off screen, it rests
  });
});
