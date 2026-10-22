import { describe, expect, it } from "vitest";

import { blankDesign, createBlock } from "@shared/email/editor/factory";
import {
  designHasContent,
  duplicateBlock,
  findBlock,
  insertBlock,
  locateBlock,
  moveBlock,
  moveBlockBy,
  normalizeDesign,
  removeBlock,
  resolveDesign,
  updateBlock,
} from "@shared/email/editor/tree";
import type {
  BrandKit,
  ColumnsBlock,
  EmailDesign,
  HeadingBlock,
} from "@shared/email/editor/types";

const KIT: BrandKit = {
  name: "Studio Sol",
  site: "https://sol.example.com",
  host: "sol.example.com",
  logo: "",
  mark: "https://sol.example.com/pwa-icon?size=192",
  colors: {
    primary: "#aa3300",
    foreground: "#111111",
    surface: "#f5f1ea",
    background: "#ffffff",
  },
  fonts: {
    heading: "'Fraunces', Georgia, serif",
    body: "Helvetica, Arial, sans-serif",
  },
  radius: 8,
  socials: [],
  address: "",
};

/** body: [heading, columns(col A: [text], col B: [])], footer: [brandFooter] */
function sample() {
  const heading = createBlock("heading") as HeadingBlock;
  const text = createBlock("text");
  const columns = createBlock("columns") as ColumnsBlock;
  columns.data.columns[0].blocks = [text];
  const design: EmailDesign = {
    ...blankDesign(),
    body: { blocks: [heading, columns] },
  };
  return { design, heading, text, columns };
}

describe("email editor tree", () => {
  it("blankDesign: brand header, empty body, brand footer, token settings", () => {
    const d = blankDesign();
    expect(d.header.blocks.map((b) => b.type)).toEqual(["brandHeader"]);
    expect(d.body.blocks).toEqual([]);
    expect(d.footer.blocks.map((b) => b.type)).toEqual(["brandFooter"]);
    expect(d.settings).toMatchObject({
      backgroundColor: "brand:surface",
      bodyBackgroundColor: "brand:background",
      defaultColor: "brand:foreground",
      defaultFont: "brand:body",
      defaultFontSize: 16,
      contentWidth: 600,
      bodyBorderRadius: 0,
    });
    expect(designHasContent(d)).toBe(false);
    expect(designHasContent(sample().design)).toBe(true);
  });

  it("finds and locates blocks inside columns", () => {
    const { design, text, columns } = sample();
    expect(findBlock(design, text.id)?.type).toBe("text");
    expect(locateBlock(design, text.id)).toMatchObject({
      region: "body",
      parentId: columns.id,
      columnId: columns.data.columns[0].id,
      index: 0,
      size: 1,
    });
  });

  it("updates nested blocks and leaves untouched regions as they were", () => {
    const { design, text } = sample();
    const next = updateBlock(design, text.id, {
      data: { html: "<p>Hi</p>" },
      style: { fontSize: 18 },
    });
    const updated = findBlock(next, text.id);
    expect(updated?.type === "text" && updated.data.html).toBe("<p>Hi</p>");
    expect(updated?.style).toMatchObject({
      fontSize: 18,
      padding: text.style.padding,
    });
    expect(next.header).toBe(design.header);
    expect(next.footer).toBe(design.footer);
    expect(updateBlock(design, "nope", { data: {} })).toBe(design);
  });

  it("removes nested blocks", () => {
    const { design, text } = sample();
    expect(findBlock(removeBlock(design, text.id), text.id)).toBeNull();
  });

  it("duplicates a columns block with fresh ids all the way down", () => {
    const { design, columns, text } = sample();
    const { design: next, id } = duplicateBlock(design, columns.id);
    expect(id).not.toBeNull();
    expect(next.body.blocks.map((b) => b.id)).toEqual([
      design.body.blocks[0].id,
      columns.id,
      id,
    ]);
    const copy = findBlock(next, id!) as ColumnsBlock;
    expect(copy.data.columns[0].id).not.toBe(columns.data.columns[0].id);
    expect(copy.data.columns[0].blocks[0].id).not.toBe(text.id);
    expect(copy.data.columns[0].blocks[0].type).toBe("text");
  });

  it("moves a block into a column, out of it and between regions", () => {
    const { design, heading, text, columns } = sample();
    const colB = columns.data.columns[1].id;
    const inCol = moveBlock(design, heading.id, {
      region: "body",
      parentId: columns.id,
      columnId: colB,
      index: 0,
    });
    expect(locateBlock(inCol, heading.id)).toMatchObject({
      parentId: columns.id,
      columnId: colB,
    });
    expect(inCol.body.blocks.map((b) => b.id)).toEqual([columns.id]);

    const out = moveBlock(design, text.id, { region: "footer", index: 0 });
    expect(out.footer.blocks[0].id).toBe(text.id);
    expect(
      (findBlock(out, columns.id) as ColumnsBlock).data.columns[0].blocks,
    ).toEqual([]);
  });

  it("refuses to move a columns block into itself", () => {
    const { design, columns } = sample();
    const target = {
      region: "body" as const,
      parentId: columns.id,
      columnId: columns.data.columns[1].id,
    };
    expect(moveBlock(design, columns.id, target)).toBe(design);
  });

  it("moves within a list, counting the gap the block leaves", () => {
    const { design, heading, columns } = sample();
    // heading at 0 dropped after columns (zone index 2) lands at index 1.
    const next = moveBlock(design, heading.id, { region: "body", index: 2 });
    expect(next.body.blocks.map((b) => b.id)).toEqual([columns.id, heading.id]);
    // Dropped right where it is: nothing changes.
    expect(moveBlock(design, heading.id, { region: "body", index: 1 })).toBe(
      design,
    );
    expect(
      moveBlockBy(design, heading.id, 1).body.blocks.map((b) => b.id),
    ).toEqual([columns.id, heading.id]);
    expect(moveBlockBy(design, heading.id, -1)).toBe(design);
  });

  it("inserts at an index, clamped", () => {
    const { design } = sample();
    const spacer = createBlock("spacer");
    expect(
      insertBlock(design, spacer, { region: "body", index: 99 }).body.blocks.at(
        -1,
      )?.id,
    ).toBe(spacer.id);
    expect(
      insertBlock(design, spacer, { region: "header", index: 0 }).header
        .blocks[0].id,
    ).toBe(spacer.id);
  });

  it("resolves brand tokens, fonts included, everywhere", () => {
    const { design } = sample();
    const r = resolveDesign(design, KIT);
    expect(r.settings.backgroundColor).toBe("#f5f1ea");
    expect(r.settings.defaultFont).toBe(KIT.fonts.body);
    const heading = r.body.blocks[0] as HeadingBlock;
    expect(heading.style.color).toBe("#111111");
    expect(heading.style.fontFamily).toBe(KIT.fonts.heading);
    // Unknown tokens: black, or the body font on a font field. Literals stay.
    const odd = resolveDesign(
      { color: "brand:nope", fontFamily: "brand:nope", other: "#123456" },
      KIT,
    );
    expect(odd).toEqual({
      color: "#000000",
      fontFamily: KIT.fonts.body,
      other: "#123456",
    });
    // The design itself is untouched.
    expect((design.body.blocks[0] as HeadingBlock).style.color).toBe(
      "brand:foreground",
    );
  });

  it("normalizes a partial design", () => {
    const d = normalizeDesign({
      body: { blocks: [{ type: "text", data: { html: "<p>x</p>" } }, 3] },
    });
    expect(d.header.blocks).toEqual([]);
    expect(d.body.blocks).toHaveLength(1);
    expect(d.body.blocks[0].id).toMatch(/^b/);
    expect(d.body.blocks[0].style).toEqual({});
    expect(d.settings.contentWidth).toBe(600);
    expect(normalizeDesign(null).body.blocks).toEqual([]);
  });
});
