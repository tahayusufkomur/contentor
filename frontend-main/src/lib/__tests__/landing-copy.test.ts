// The copy brief as a test: every key the chapters read exists, fits its
// length cap, carries no invented number, and helpBot is untouched.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_IDS,
  FAQ_KEYS,
  MONEY_TILES,
  STUDENT_TILES,
  STUDIO_TILES,
} from "@/lib/landing";

const messages = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../messages/en/marketing.json"),
    "utf8",
  ),
) as Record<string, unknown>;
const get = (p: string) =>
  p
    .split(".")
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      messages,
    );

const heads = (ns: string) => ({
  [`${ns}.eyebrow`]: 24,
  [`${ns}.title`]: 44,
  [`${ns}.lead`]: 140,
});
const tile = (p: string, text = 110) => ({
  [`${p}.title`]: 32,
  [`${p}.text`]: text,
});

/** key path → max characters. */
const CAPS: Record<string, number> = {
  "landingNav.cta": 12,
  ...Object.fromEntries(CHAPTER_IDS.map((id) => [`landingNav.${id}`, 10])),
  "hero.title": 40,
  "hero.lead": 120,
  "hero.cta": 20,
  "hero.videoLabel": 90,
  ...heads("build"),
  "build.bands.one": 90,
  "build.bands.two": 90,
  "build.bands.three": 90,
  ...heads("looks"),
  "looks.galleryLabel": 40,
  "looks.renderAlt": 60,
  ...heads("studio"),
  ...Object.assign(
    {},
    ...STUDIO_TILES.map((t) => tile(`studio.tiles.${t.key}`)),
  ),
  ...heads("assistant"),
  "assistant.bands.one": 90,
  "assistant.bands.two": 90,
  "assistant.bands.three": 90,
  ...heads("students"),
  "students.phoneLabel": 90,
  ...Object.assign(
    {},
    ...STUDENT_TILES.map((t) => tile(`students.tiles.${t.key}`)),
  ),
  ...heads("money"),
  ...Object.assign(
    {},
    ...MONEY_TILES.map((k) => tile(`money.tiles.${k}`, 120)),
  ),
  ...heads("start"),
  "start.founding.eyebrow": 24,
  "start.founding.title": 44,
  "start.founding.text": 160,
  ...Object.assign(
    {},
    ...["concierge", "discount", "featured"].map((k) => ({
      [`start.founding.perks.${k}.title`]: 36,
      [`start.founding.perks.${k}.text`]: 140,
    })),
  ),
  "start.founding.cta": 24,
  "start.founding.note": 80,
  "start.pricing.title": 44,
  "start.pricing.text": 140,
  "start.pricing.cta": 24,
  "start.faq.title": 44,
  ...Object.assign(
    {},
    ...FAQ_KEYS.map((k) => ({
      [`start.faq.items.${k}.q`]: 70,
      [`start.faq.items.${k}.a`]: 320,
    })),
  ),
  "start.cta.title": 44,
  "start.cta.text": 140,
  "start.cta.button": 24,
  "start.cta.note": 60,
};

const HELP_BOT_KEYS = [
  "title",
  "bubbleLabel",
  "close",
  "intro",
  "placeholder",
  "send",
  "thinking",
  "error",
  "suggestPrice",
  "suggestPayouts",
  "suggestDomain",
  "rateUp",
  "rateDown",
  "talkToHuman",
  "humanRequestedLine",
  "agentJoined",
  "assistantResumed",
  "humanModeNotice",
];

describe("landing copy", () => {
  it.each(Object.entries(CAPS))("%s is set and ≤ %i chars", (key, cap) => {
    const v = get(key);
    expect(typeof v, key).toBe("string");
    expect((v as string).trim().length, key).toBeGreaterThan(0);
    expect((v as string).length, `${key}: "${v}"`).toBeLessThanOrEqual(cap);
  });
  it("carries no numbers outside the founding tile and the FAQ (spec: no invented numbers)", () => {
    for (const key of Object.keys(CAPS)) {
      if (key.startsWith("start.founding") || key.startsWith("start.faq"))
        continue;
      expect(get(key) as string, key).not.toMatch(/\d/);
    }
  });
  it("renderAlt names the look", () => {
    expect(get("looks.renderAlt")).toContain("{look}");
  });
  it("the replaced section namespaces are gone", () => {
    for (const ns of [
      "socialProof",
      "stats",
      "features",
      "howItWorks",
      "finalCta",
      "foundingCreators",
      "faq",
    ])
      expect(messages[ns], ns).toBeUndefined();
  });
  it("helpBot keeps every key the help bubble reads", () => {
    for (const k of HELP_BOT_KEYS)
      expect(typeof get(`helpBot.${k}`), k).toBe("string");
  });
});
