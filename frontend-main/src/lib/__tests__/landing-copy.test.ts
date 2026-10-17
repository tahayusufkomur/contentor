// The copy brief as a test: every key the sections read exists, fits its
// length cap, carries no invented number, and helpBot is untouched.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAQ_KEYS,
  FOUNDING_PERKS,
  LOOK_CARDS,
  TEAM_ROLES,
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

const heads = (ns: string, title = 44) => ({
  [`${ns}.eyebrow`]: 24,
  [`${ns}.title`]: title,
  [`${ns}.lead`]: 140,
});

/** key path → max characters. */
const CAPS: Record<string, number> = {
  "hero.pill": 64,
  "hero.title": 64,
  "hero.lead": 140,
  "hero.cta": 20,
  "hero.secondary": 20,
  ...Object.fromEntries(
    ["trial", "cancel", "time"].map((k) => [`hero.trust.${k}`, 24]),
  ),
  "hero.you": 12,
  "hero.youText": 20,
  "hero.onIt": 10,
  "hero.done": 10,
  ...Object.fromEntries(TEAM_ROLES.map(({ key }) => [`hero.roles.${key}`, 40])),
  "for.title": 44,
  "for.lead": 140,
  "for.galleryLabel": 40,
  "for.renderAlt": 60,
  ...Object.fromEntries(LOOK_CARDS.map((c) => [`for.niches.${c.look}`, 24])),
  ...heads("team", 48),
  "team.tabsLabel": 24,
  ...Object.assign(
    {},
    ...TEAM_ROLES.map(({ key }) => ({
      // The owner's "Content Creating Specialist" is 27 characters.
      [`team.roles.${key}.name`]: 28,
      [`team.roles.${key}.title`]: 48,
      [`team.roles.${key}.text`]: 160,
      [`team.roles.${key}.tools`]: 90,
      [`team.roles.${key}.sceneLabel`]: 140,
    })),
  ),
  "team.roles.producer.live": 24,
  ...Object.fromEntries(
    ["laptop", "tablet", "phone"].map((k) => [
      `team.roles.producer.devices.${k}`,
      28,
    ]),
  ),
  "team.roles.community.scene.sent": 28,
  "team.roles.community.scene.from": 24,
  "team.roles.community.scene.now": 8,
  "team.roles.community.scene.title": 28,
  "team.roles.community.scene.body": 40,
  ...Object.fromEntries(
    ["push", "email", "app"].map((k) => [
      `team.roles.community.scene.channels.${k}`,
      12,
    ]),
  ),
  "team.roles.cashier.scene.today": 16,
  "team.roles.cashier.scene.received": 28,
  "team.roles.cashier.scene.now": 8,
  "team.roles.cashier.scene.ago": 20,
  "team.roles.cashier.scene.from": 40,
  ...heads("earnings"),
  "earnings.students": 24,
  "earnings.price": 24,
  "earnings.plan": 24,
  "earnings.plans.starter": 12,
  "earnings.plans.pro": 12,
  "earnings.keep": 30,
  "earnings.yearly": 30,
  "earnings.gross": 24,
  "earnings.fee": 30,
  "earnings.planCost": 24,
  "earnings.note": 120,
  "earnings.fallback": 60,
  "earnings.cta": 20,
  "earnings.ctaNote": 60,
  "founder.eyebrow": 32,
  "founder.title": 44,
  "founder.text": 320,
  "founder.signature": 40,
  "founder.offer.title": 24,
  "founder.offer.text": 60,
  ...Object.assign(
    {},
    ...FOUNDING_PERKS.map((k) => ({
      [`founder.offer.perks.${k}.title`]: 36,
      [`founder.offer.perks.${k}.text`]: 140,
    })),
  ),
  "founder.offer.cta": 24,
  "founder.offer.note": 80,
  "start.pricing.title": 44,
  "start.pricing.text": 160,
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
  it("carries no numbers outside the founding offer and the FAQ (spec: no invented numbers)", () => {
    for (const key of Object.keys(CAPS)) {
      if (key.startsWith("founder.offer") || key.startsWith("start.faq"))
        continue;
      // The trial's length is the offer, not an invented number.
      const words = (get(key) as string).replace(/\b14(-day| days)\b/g, "");
      expect(words, key).not.toMatch(/\d/);
    }
  });
  it("promises the trial, never the retired free plan (decision 2026-10-16)", () => {
    const copy = JSON.stringify(messages);
    expect(copy).not.toMatch(/free forever|free plan|no (credit )?card/i);
    expect(get("hero.trust.trial")).toContain("14");
  });
  it("renderAlt names the look; the calculator's lines take their numbers", () => {
    expect(get("for.renderAlt")).toContain("{look}");
    expect(get("earnings.yearly")).toContain("{amount}");
    expect(get("earnings.fee")).toContain("{pct}");
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
      "landingNav",
      "build",
      "looks",
      "studio",
      "assistant",
      "students",
      "money",
      "screens",
      "path",
      "support",
    ])
      expect(messages[ns], ns).toBeUndefined();
  });
  it("promises only the channels the product sends on (push, email, the app)", () => {
    expect(JSON.stringify(messages)).not.toMatch(/whatsapp|telegram/i);
  });
  it("helpBot keeps every key the help bubble reads", () => {
    for (const k of HELP_BOT_KEYS)
      expect(typeof get(`helpBot.${k}`), k).toBe("string");
  });
});
