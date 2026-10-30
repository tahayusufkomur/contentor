import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Polish drafts never address the creator (or anyone) in a masculine form.
// JS `\b` is ASCII-only (ś is not a word character), so the guards use
// `(?![\p{L}])` instead.
export const MASCULINE_PAST = /(łeś|łaś)(?![\p{L}])/iu;
const MASCULINE_CALLS =
  /(wypróbuj|napisz( go)?|zrób|stwórz|zaprojektuj|sprawdź) sam(?![\p{L}])|jesteś ekspertem|bądź życzliwy|jesteś zalogowany/iu;

// Default content written onto every Polish site (blocks.json): what a visitor
// reads is addressed to anyone, and the creator's own bio never says whether
// she is a man or a woman. Named testimonials agree with their (named) author
// and are exempt.
export const READY_MASC_FEM = /(?<![\p{L}])gotow[ya](?![\p{L}])/iu;
export const FIRST_PERSON_PAST = /(?<![\p{L}])\p{L}*(łem|łam)(?![\p{L}])/iu;
export const GENDERED_JOB =
  /(?<![\p{L}])(certyfikowan[ya]|pełn[ay] pasji instruktor\p{L}*|instruktor(ka)?|trener(ka)?|wizażyst(ka)?|zawodni(k|czka)|(zupełnie|jesteś) początkując[ya])(?![\p{L}])/iu;

const ROOT = join(__dirname, "../../../..");
const DIRS = [
  "frontend-customer/messages/pl",
  "frontend-main/messages/pl",
  "packages/shared/src/i18n/messages/pl",
];

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  return [];
}

const all = DIRS.flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) =>
      leaves(JSON.parse(readFileSync(join(ROOT, dir, f), "utf8"))).map(
        ([key, text]) => [`${dir}/${f}:${key}`, text] as const,
      ),
    ),
);

describe("the guard itself", () => {
  it("sees a masculine past form with or without a word after it", () => {
    expect(MASCULINE_PAST.test("Wykorzystałeś limit wpisów")).toBe(true);
    expect(MASCULINE_PAST.test("Wykorzystałeś")).toBe(true);
    expect(MASCULINE_PAST.test("Zrobiłaś to.")).toBe(true);
    expect(MASCULINE_PAST.test("Limit został wykorzystany")).toBe(false);
    expect(MASCULINE_PAST.test("właściciel, Leśna zieleń")).toBe(false);
  });
});

describe("the default-content guards themselves", () => {
  it("see 'ready', first-person past forms and gendered job titles", () => {
    expect(READY_MASC_FEM.test("Gotowy, aby zacząć?")).toBe(true);
    expect(READY_MASC_FEM.test("Gotowa na Metamorfozę?")).toBe(true);
    expect(READY_MASC_FEM.test("Czas zacząć?")).toBe(false);
    expect(FIRST_PERSON_PAST.test("Spędziłem lata na dopracowywaniu")).toBe(
      true,
    );
    expect(FIRST_PERSON_PAST.test("Pracowałam za kulisami")).toBe(true);
    expect(FIRST_PERSON_PAST.test("Uczę od lat. Ciało i dyscyplina")).toBe(
      false,
    );
    expect(GENDERED_JOB.test("Certyfikowana instruktorka jogi")).toBe(true);
    expect(GENDERED_JOB.test("Profesjonalna wizażystka")).toBe(true);
    expect(GENDERED_JOB.test("czy jesteś zupełnie początkujący")).toBe(true);
    expect(GENDERED_JOB.test("Mam certyfikat i od lat uczę jogi")).toBe(false);
    expect(GENDERED_JOB.test("modyfikacje dla początkujących")).toBe(false);
  });
});

describe("Polish default content", () => {
  const blocks = all.filter(
    ([key]) =>
      key.includes("messages/pl/blocks.json:") &&
      !key.includes(".testimonials."),
  );
  it("has something to check", () =>
    expect(blocks.length).toBeGreaterThan(300));
  it("never asks the visitor 'Gotowy/Gotowa' (a gendered 'ready')", () => {
    expect(blocks.filter(([, t]) => READY_MASC_FEM.test(t))).toEqual([]);
  });
  it("never has the creator speak in a gendered past form or job title", () => {
    expect(blocks.filter(([, t]) => FIRST_PERSON_PAST.test(t))).toEqual([]);
    expect(blocks.filter(([, t]) => GENDERED_JOB.test(t))).toEqual([]);
  });
});

describe("Polish message files", () => {
  it("never use a masculine or feminine past form for the reader", () => {
    expect(all.filter(([, text]) => MASCULINE_PAST.test(text))).toEqual([]);
  });

  it("never call the reader a masculine noun or adjective", () => {
    expect(all.filter(([, text]) => MASCULINE_CALLS.test(text))).toEqual([]);
  });
});
