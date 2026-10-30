import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Polish drafts never address the creator (or anyone) in a masculine form.
// JS `\b` is ASCII-only (ś is not a word character), so the guards use
// `(?![\p{L}])` instead.
export const MASCULINE_PAST = /(łeś|łaś)(?![\p{L}])/iu;
const MASCULINE_CALLS =
  /(wypróbuj|napisz( go)?|zrób|stwórz|zaprojektuj|sprawdź) sam(?![\p{L}])|jesteś ekspertem|bądź życzliwy|jesteś zalogowany/iu;

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

describe("Polish message files", () => {
  it("never use a masculine or feminine past form for the reader", () => {
    expect(all.filter(([, text]) => MASCULINE_PAST.test(text))).toEqual([]);
  });

  it("never call the reader a masculine noun or adjective", () => {
    expect(all.filter(([, text]) => MASCULINE_CALLS.test(text))).toEqual([]);
  });
});
