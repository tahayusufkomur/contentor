// Holds public/media honest (spec 5.3): every file media.json names exists and
// is the size it claims, the hero clip stays ≤ 3 MB and every other clip
// ≤ 2 MB, the folder ≤ 35 MB, and every coach photograph shows a person.
// Phase 2's landing-media.test.ts adds the full-scroll sums; not repeated here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { media, type MediaItem } from "@/lib/media";

const PUBLIC = path.resolve(__dirname, "../../../public");
const DIR = path.join(PUBLIC, "media");
const { items } = JSON.parse(
  readFileSync(path.join(DIR, "media.json"), "utf8"),
) as {
  items: Record<string, MediaItem>;
};
const entries = Object.entries(items);
const MB = 1_000_000; // decimal: the stricter reading (Phase 5 checks with 2000000)
const onDisk = (p: string) => path.join(PUBLIC, p.replace(/^\//, ""));
const files = (m: MediaItem) =>
  [m.src, m.webm, m.phoneSrc, m.poster, m.srcSmall].filter((p): p is string =>
    Boolean(p),
  );
const videos = (m: MediaItem) =>
  [m.src, m.webm, m.phoneSrc].filter((p): p is string => Boolean(p));
const du = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (sum, e) =>
      sum +
      (e.isDirectory()
        ? du(path.join(dir, e.name))
        : statSync(path.join(dir, e.name)).size),
    0,
  );
// A coach photograph's alt is its Pix4Less description: it must name the person in frame.
const PERSON =
  /\b(woman|women|man|men|teacher|instructor|coach|tutor|student|students|dancer|chef|cook|musician|guitarist|pianist|singer|potter|artist|mother|father|parent|child|girl|boy|hiker|guide|person|people|she|he|her|his)\b/i;

describe("media()", () => {
  it("throws on a key the manifest does not have", () => {
    expect(() => media("no-such-key")).toThrow(
      'media: unknown key "no-such-key"',
    );
  });
  it("does not answer for Object.prototype names", () => {
    expect(() => media("constructor")).toThrow(/unknown key/);
  });
  it.runIf(entries.length > 0)("returns the manifest entry", () => {
    const [key, item] = entries[0];
    expect(media(key)).toEqual(item);
  });
});

describe("media budget (spec 5.3)", () => {
  it("every file media.json names exists, and bytes is the src's size", () => {
    for (const [key, item] of entries) {
      for (const p of files(item))
        expect(() => statSync(onDisk(p)), `${key}: ${p}`).not.toThrow();
      expect(item.bytes, key).toBe(statSync(onDisk(item.src)).size);
    }
  });
  it("the hero clip ≤ 3 MB and every other clip ≤ 2 MB, each encode", () => {
    for (const [key, item] of entries) {
      if (item.kind === "still") continue;
      const cap = key === "hero-looks" ? 3 * MB : 2 * MB;
      for (const p of videos(item))
        expect(statSync(onDisk(p)).size, p).toBeLessThanOrEqual(cap);
    }
  });
  it("public/media ≤ 35 MB", () => {
    const total = du(DIR);
    expect(total / MB, `${(total / MB).toFixed(1)} MB`).toBeLessThanOrEqual(35);
  });
  it("every coach photograph names a person and carries its licence", () => {
    for (const [key, item] of entries.filter(([k]) => k.startsWith("still-"))) {
      expect(
        item.alt ?? "",
        `${key}: alt must name the person in frame`,
      ).toMatch(PERSON);
      expect(item.license, `${key}: license`).toBeTruthy();
    }
  });
});
