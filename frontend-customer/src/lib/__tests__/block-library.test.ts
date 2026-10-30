import { describe, expect, it } from "vitest";
import { FAMILIES, FAMILY_IDS, type FamilyField } from "@shared/sections/types";
import adminEn from "../../../messages/en/admin.json";
import blocksEn from "../../../messages/en/blocks.json";
import { makeBlockLibrary } from "@/lib/blocks/registry";
import { slug } from "@/lib/blocks/say";
import type { BlockDefinition } from "@/lib/blocks/types";
import type { FieldSchema } from "@/lib/blocks/field-schema";
import { blockWords } from "./block-words";

const library = (creator: string, site: string) => {
  const { ui, site: words } = blockWords(creator, site);
  return makeBlockLibrary(ui, words);
};

const allFields = (fields: FieldSchema[]): FieldSchema[] =>
  fields.flatMap((f) => [f, ...allFields(f.itemFields ?? [])]);

const defs = (lib: ReturnType<typeof library>): BlockDefinition[] =>
  (["content", "dynamic", "section", "custom"] as const).flatMap((g) =>
    lib.byGroup(g),
  );

describe("the block library's words", () => {
  it("every block, field, option and hint resolves (a missing key throws)", () => {
    const lib = library("en", "en");
    for (const def of defs(lib)) {
      expect(def.label, def.type).not.toMatch(/^(block|family)\./);
      for (const f of allFields(def.fields)) {
        for (const text of [
          f.label,
          f.helpText,
          f.itemLabel,
          ...(f.options ?? []).map((o) => o.label),
        ])
          expect(text ?? "", `${def.type}.${f.key}`).not.toMatch(
            /^(field|layout|option|help|item|manifest|upTo)/,
          );
      }
    }
  });

  it("keeps the section manifest's English texts as the English messages", () => {
    const ui = adminEn.owner.blockLib;
    const labels = new Set<string>();
    const walk = (fields: Record<string, FamilyField>) => {
      for (const f of Object.values(fields)) {
        labels.add(f.label);
        if (f.itemLabel) expect(ui.item).toHaveProperty(slug(f.itemLabel));
        walk(f.fields ?? {});
      }
    };
    for (const id of FAMILY_IDS) {
      expect(ui.family[id]).toBe(FAMILIES[id].label);
      walk(FAMILIES[id].fields);
    }
    for (const label of labels)
      expect(ui.manifest[slug(label) as keyof typeof ui.manifest]).toBe(label);
    expect(Object.keys(ui.manifest)).toHaveLength(labels.size);
  });

  it("has one 'Add …' message for each kind of row, and none for a missing kind", () => {
    const lib = library("en", "en");
    const kinds = new Set(
      defs(lib).flatMap((d) =>
        allFields(d.fields)
          .map((f) => f.itemKind)
          .filter(Boolean),
      ),
    );
    expect(kinds.size).toBeGreaterThan(8);
    for (const kind of kinds)
      expect(adminEn.owner.field.addItem).toHaveProperty(kind as string);
  });
});

describe("what a new block writes onto the site", () => {
  it("is the site's language, whatever the creator's", () => {
    const lib = library("pl", "tr");
    const block = lib.newBlock("hero", "yoga");
    const en = library("en", "en").newBlock("hero", "yoga");
    expect(block.heading).toBeTruthy();
    expect(block.heading).not.toBe(en.heading);
    expect(block.heading).toBe(
      blockWords("en", "tr").site("example.yoga.hero.heading"),
    );
    // Her names stay in her language.
    expect(lib.def("hero")?.label).toBe(
      blockWords("pl", "en").ui("block.hero"),
    );
    expect(lib.def("hero")?.label).not.toBe(
      library("en", "tr").def("hero")?.label,
    );
  });

  it("writes English for an English site, with the links and HTML around the words", () => {
    const lib = library("tr", "en");
    expect(lib.newBlock("hero", "yoga")).toMatchObject({
      type: "hero",
      enabled: true,
      heading: blocksEn.example.yoga.hero.heading,
      ctaText: blocksEn.example.yoga.hero.ctaText,
      ctaHref: "/courses",
    });
    expect(lib.newBlock("richText", "pilates").body).toBe(
      `<p>${blocksEn.example.pilates.richText.body}</p>`,
    );
    // Stats keep their numbers and labels together, in the site's words.
    expect(lib.newBlock("stats", "makeup").items).toEqual(
      blocksEn.example.makeup.stats.items,
    );
  });

  it("falls back to the generic copy for an unknown niche or a type a niche has none for", () => {
    const lib = library("en", "en");
    expect(lib.newBlock("hero", "chess").heading).toBe(
      blocksEn.example.generic.hero.heading,
    );
    expect(lib.newBlock("gallery", "yoga").heading).toBe(
      blocksEn.example.generic.gallery.heading,
    );
    expect(lib.newBlock("hero").heading).toBe(
      blocksEn.example.generic.hero.heading,
    );
  });

  it("gives every block type content in every language the site can have", () => {
    const en = library("en", "en");
    for (const site of ["tr", "de", "pl"]) {
      const lib = library("en", site);
      for (const def of defs(lib).filter((d) => d.group !== "custom")) {
        const block = { ...lib.newBlock(def.type, "yoga", "journal"), id: "" };
        const english = { ...en.newBlock(def.type, "yoga", "journal"), id: "" };
        expect(block.type).toBe(def.type);
        // No message path leaked in as text.
        expect(JSON.stringify(block)).not.toMatch(
          /"(default|example|template)\.|"section\.\w+\.\w+"/,
        );
        // A section with no words of its own (the clip) is the same everywhere.
        if (def.type !== "section.video")
          expect(block, `${site} ${def.type}`).not.toEqual(english);
      }
    }
  });

  it("seeds a section in the site's language, with its slots", () => {
    const tr = library("en", "tr").newBlock(
      "section.faq",
      undefined,
      "journal",
    );
    const en = library("en", "en").newBlock(
      "section.faq",
      undefined,
      "journal",
    );
    expect(tr.variant).toBe(en.variant);
    expect(tr.heading).not.toBe(en.heading);
    expect(tr.items).toHaveLength(3);
    expect(library("en", "en").newBlock("section.moments").photos).toEqual([
      {},
      {},
      {},
    ]);
    // The story's body is rich text.
    expect(library("en", "de").newBlock("section.story").body).toMatch(
      /^<p>.+<\/p>$/,
    );
  });
});

describe("the built-in page templates", () => {
  it("are named for the creator and written for the site", () => {
    const lib = library("de", "pl");
    const home = lib.templatesFor("home");
    expect(home.map((t) => t.id)).toEqual([
      "home-classic",
      "home-storyteller",
      "home-minimal",
    ]);
    const en = library("en", "en").templatesFor("home");
    expect(home[0].name).not.toBe(en[0].name);
    expect(home[0].blocks[0].heading).not.toBe(en[0].blocks[0].heading);
    expect(home[0].blocks[0].heading).toBe(
      blockWords("en", "pl").site("template.homeClassic.hero.heading"),
    );
    // Identities and links are untouched.
    expect(home[0].blocks.map((b) => b.type)).toEqual([
      "hero",
      "courseGrid",
      "testimonials",
      "cta",
    ]);
    expect(home[0].blocks[0].ctaHref).toBe("/courses");
    expect(
      library("en", "en").templatesFor("pricing")[0].blocks[1].items,
    ).toHaveLength(2);
  });

  it("offers each page its own", () => {
    const lib = library("en", "en");
    expect(lib.templatesFor("about").map((t) => t.id)).toEqual([
      "about-founder",
    ]);
    expect(lib.templatesFor("contact")[0].blocks[1].items).toEqual([]);
    expect(lib.templatesFor("faq")).toEqual([]);
  });
});
