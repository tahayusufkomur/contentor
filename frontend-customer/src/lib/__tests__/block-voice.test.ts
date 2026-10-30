import { describe, expect, it } from "vitest";
import adminDe from "../../../messages/de/admin.json";
import adminPl from "../../../messages/pl/admin.json";
import blocksDe from "../../../messages/de/blocks.json";
import blocksPl from "../../../messages/pl/blocks.json";
import blocksTr from "../../../messages/tr/blocks.json";

// The block library's drafts keep the house voice and the language's numerals.

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  return [];
}

// A job title that says whether the creator is a man or a woman.
export const DE_GENDERED_JOB =
  /(?<![\p{L}])(Zertifizierter|Zertifizierte|Kursleiter|Kursleiterin|\p{L}*-?Trainer|\p{L}*-?Trainerin|Lehrer|Lehrerin|Sportwissenschaftler|Sportwissenschaftlerin|Wettkämpferin)(?![\p{L}])/u;
// Formal address (du, never Sie).
export const DE_FORMAL =
  /(?<![\p{L}])(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)(?![\p{L}])/u;
// English thousands comma in a number.
export const COMMA_THOUSANDS = /\d,\d{3}(?!\d)/;

const deBlocks = leaves(blocksDe);
const deLabels = leaves(adminDe.owner.blockLib);
const plBlocks = leaves(blocksPl);
const trBlocks = leaves(blocksTr);

describe("the guards themselves", () => {
  it("fire on what they are for", () => {
    expect(
      DE_GENDERED_JOB.test("Zertifizierter Pilates-Trainer mit Erfahrung"),
    ).toBe(true);
    expect(DE_GENDERED_JOB.test("Leidenschaftliche Bauchtanz-Lehrerin")).toBe(
      true,
    );
    expect(
      DE_GENDERED_JOB.test("Mit Pilates-Zertifizierung und Erfahrung"),
    ).toBe(false);
    expect(DE_FORMAL.test("Ihr Vorname")).toBe(true);
    expect(DE_FORMAL.test("Dein Vorname")).toBe(false);
    expect(COMMA_THOUSANDS.test("1,000+")).toBe(true);
    expect(COMMA_THOUSANDS.test("1.000+")).toBe(false);
    expect(COMMA_THOUSANDS.test("4,9")).toBe(false);
  });
});

describe("German block content", () => {
  it("never names the creator's gender in a job title", () => {
    expect(deBlocks.filter(([, t]) => DE_GENDERED_JOB.test(t))).toEqual([]);
  });
  it("is in du-form, in the content and in the labels", () => {
    expect(deBlocks.filter(([, t]) => DE_FORMAL.test(t))).toEqual([]);
    expect(deLabels.filter(([, t]) => DE_FORMAL.test(t))).toEqual([]);
  });
});

describe("numerals follow the language", () => {
  it("de, pl and tr write 1.000+ / 1 000+, never 1,000+", () => {
    for (const set of [deBlocks, plBlocks, trBlocks])
      expect(set.filter(([, t]) => COMMA_THOUSANDS.test(t))).toEqual([]);
    expect(blocksDe.template.aboutFounder.stats.items[1].value).toBe("1.000+");
    expect(blocksPl.template.aboutFounder.stats.items[1].value).toBe("1 000+");
    expect(blocksTr.template.aboutFounder.stats.items[1].value).toBe("1.000+");
  });
  it("pl 'at most N characters' does not open with a preposition that rules the case", () => {
    expect(adminPl.owner.blockLib.upTo).not.toMatch(/^Do /);
    expect(adminPl.owner.blockLib.upTo).toMatch(/many \{# znaków\}/);
  });
});
