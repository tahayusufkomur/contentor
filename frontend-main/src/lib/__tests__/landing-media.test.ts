// Holds the landing against the manifest: every key the sections read exists
// with the right kind and a real file, clips carry phone encodes, and a full
// scroll stays inside spec 5.7.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";
import {
  HERO_CHIPS,
  HERO_PHOTO,
  LANDING_MEDIA,
  LOOK_CARDS,
  PATH_STEPS,
  SUPPORT_CLIP,
} from "@/lib/landing";

interface Item {
  kind: string;
  src: string;
  poster?: string;
  phoneSrc?: string;
  srcSmall?: string;
  alt?: string;
}
const PUBLIC = path.resolve(__dirname, "../../../public");
const manifest = JSON.parse(
  readFileSync(path.join(PUBLIC, "media/media.json"), "utf8"),
) as { items: Record<string, Item> };
const item = (key: string): Item => manifest.items[key];
const size = (p: string) =>
  statSync(path.join(PUBLIC, p.replace(/^\//, ""))).size;
const MB = 1024 * 1024;
const CLIPS = [...PATH_STEPS.map((s) => s.clip), SUPPORT_CLIP];
const STILLS = Object.entries(LANDING_MEDIA)
  .filter(([, kind]) => kind === "still")
  .map(([key]) => key);

describe("landing media keys", () => {
  it.each(Object.entries(LANDING_MEDIA))(
    "%s is a %s with a file",
    (key, kind) => {
      expect(
        item(key),
        `${key} is missing from public/media/media.json: scripts/footage/encode.sh landing`,
      ).toBeDefined();
      expect(item(key).kind).toBe(kind);
      expect(() => size(item(key).src), item(key).src).not.toThrow();
    },
  );
  it("every clip carries a poster and a phone encode", () => {
    for (const key of CLIPS) {
      expect(item(key).poster, key).toBeTruthy();
      expect(item(key).phoneSrc, key).toBeTruthy();
    }
  });
  it("every still has alt text and an 800 px twin", () => {
    for (const key of STILLS) {
      expect(item(key).alt, key).toBeTruthy();
      expect(item(key).srcSmall, key).toBeTruthy();
    }
  });
  it("the twelve look cards name enabled looks, once each", () => {
    expect(LOOK_CARDS).toHaveLength(12);
    expect(new Set(LOOK_CARDS.map((c) => c.look)).size).toBe(12);
    for (const c of LOOK_CARDS)
      expect(SITE_STYLES[c.look]?.enabled, c.look).toBe(true);
  });
});

describe("landing media budget (spec 5.7)", () => {
  // What a full scroll loads. Look cards are lazy, so count the cards a
  // viewport shows plus one.
  const sum = (paths: string[]) => paths.reduce((a, p) => a + size(p), 0);
  const posters = CLIPS.map((k) => item(k).poster as string);
  it("desktop: five clips, the hero and its screens, four cards ≤ 8 MB", () => {
    const looks = LOOK_CARDS.slice(0, 4).flatMap((c) => [
      item(c.still).src,
      item(c.render).src,
    ]);
    const total = sum([
      ...CLIPS.map((k) => item(k).src),
      ...posters,
      item(HERO_PHOTO).src,
      ...HERO_CHIPS.map((k) => item(k).src),
      ...looks,
    ]);
    expect(total / MB, `${(total / MB).toFixed(2)} MB`).toBeLessThanOrEqual(8);
  });
  it("phone: phone encodes, small stills, two cards ≤ 4 MB", () => {
    const small = (k: string) => item(k).srcSmall ?? item(k).src;
    const looks = LOOK_CARDS.slice(0, 2).flatMap((c) => [
      small(c.still),
      small(c.render),
    ]);
    const total = sum([
      ...CLIPS.map((k) => item(k).phoneSrc as string),
      ...posters,
      small(HERO_PHOTO),
      ...HERO_CHIPS.map(small),
      ...looks,
    ]);
    expect(total / MB, `${(total / MB).toFixed(2)} MB`).toBeLessThanOrEqual(4);
  });
});
