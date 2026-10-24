// The phone-first contract (docs/superpowers/specs/2026-10-24-site-styles-wow-design.md, R4):
// coach traffic lands on phones, so on 390x844 the first screen of every style's home hero
// shows the photo (or the giant type), the H1 and the primary button. One test per enabled
// style, named by the style id, so a failure names the style. Reads the design showcase on
// the demo tenant with the content a composed site really carries (size=real, fixture=yoga:
// no hero meta, no second button). No sign-in, no data written.
//
//   phone  390x844   under a 64 px spacer (the real site header), with headlines of 12, 24, 26, 28,
//                    30 and 36 characters (the home hero's length tiers: kinetic's giant tier
//                    ends at 24, dojo/encore/manuscript/maison at 26, atelier/nocturne/tavola/
//                    primer/grid at 28, ledger at 30, the composer's cap is 36): h1 bottom <= 844;
//                    the first link/button fully inside 0..844; the largest hero image shows
//                    >= 0.4 * 844 px of its height on screen. Type-led exception (no photo):
//                    manuscript's h1 is at least 44px. Each phone load also checks that the
//                    spacer and the headline took effect (h1 top >= 64, h1 text has the headline),
//                    so a showcase that ignored the params cannot pass.
//   desktop 1440x900 h1 >= 72px; the first button's bottom <= 900.
//
// Each style also logs its slack: how far the h1, the button or the photo's minimum share could
// move down before the contract breaks. The design margin for real headers is 30 px; the
// assertions are the contract's own numbers.
//
// Run one batch: cd e2e && npx playwright test 92-phone-first --grep "atelier|dojo"
import fs from "node:fs";
import path from "node:path";
import { type Browser, expect, test } from "@playwright/test";

const STYLES_DIR = path.resolve(__dirname, "../../packages/shared/src/sections/styles");
const STYLE_IDS: string[] = fs
  .readdirSync(STYLES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), "utf8")))
  .filter((m) => m.enabled)
  .map((m) => m.id as string)
  .sort();

/** Styles whose phone hero is type, not a photo: the h1 must carry the screen instead. */
const TYPE_LED: Record<string, number> = { manuscript: 44 };

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_PHOTO_SHARE = 0.4; // of the phone's height
const MIN_DESKTOP_H1 = 72;
const PHONE_HEADER = 64; // the real site header is about 57-64 px; showcase `header=` renders a spacer
/** Headlines of the composer's home hero (at most 36 characters), wide letters, one at the upper
 *  edge of each length tier the heroes branch on (see the header), so every style's giant-type
 *  branch and its longest wrap are measured. A 29-character headline sits between the 28 and
 *  30 ones (both measured) and is never taller than the 30. */
const HEADLINES = [
  "Breathe well", // 12
  "Yoga for calm busy lives", // 24
  "Yoga for real, busy people", // 26
  "Practical Parenting Programs", // 28
  "Gentle Strength For Busy Weeks", // 30
  "Practical Parenting Workshops Online", // 36
];

type Box = { top: number; bottom: number; left: number; right: number };
type Hero = {
  h1: (Box & { fontSize: number; text: string }) | null;
  button: (Box & { text: string }) | null;
  image: (Box & { shown: number }) | null;
};

/** Runs in the page. `viewportHeight` is the first screen's height. */
function measure(viewportHeight: number): Hero | null {
  const hero = document.querySelector('[data-showcase^="hero."]');
  if (!hero) return null;
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, viewportHeight) - Math.max(r.top, 0));
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  const h1El = hero.querySelector("h1");
  const buttonEl = [...hero.querySelectorAll("a, button")].find(visible) ?? null;
  const images = [...hero.querySelectorAll("img[data-site-img]")]
    .filter(visible)
    .sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });

  return {
    h1: h1El && {
      ...box(h1El),
      fontSize: parseFloat(getComputedStyle(h1El).fontSize),
      text: (h1El.textContent ?? "").trim(),
    },
    button: buttonEl && { ...box(buttonEl), text: (buttonEl.textContent ?? "").trim() },
    image: images[0] ? { ...box(images[0]), shown: shown(images[0]) } : null,
  };
}

type View = { width: number; height: number };

/** One browser context per view; each URL query is measured in turn. */
async function heroesAt(browser: Browser, style: string, view: View, phone: boolean, queries: string[]) {
  const ctx = await browser.newContext({
    viewport: view,
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: "light",
    reducedMotion: "reduce", // measure the settled layout, not an entrance animation mid-flight
  });
  try {
    const page = await ctx.newPage();
    const heroes: (Hero | null)[] = [];
    for (const query of queries) {
      await page.goto(
        `http://demo-yoga.localhost/design-showcase?style=${style}&page=home&bare=1&size=real&fixture=yoga${query}`,
        { waitUntil: "domcontentloaded", timeout: 90_000 },
      );
      await page.waitForSelector('[data-showcase^="hero."]', { timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      heroes.push(await page.evaluate(measure, view.height));
    }
    return heroes;
  } finally {
    await ctx.close();
  }
}

test.describe.configure({ retries: 0 }); // layout numbers do not flake; a retry would only hide a first-compile timeout
test.setTimeout(240_000);

for (const style of STYLE_IDS) {
  test(style, async ({ browser }) => {
    const phones = await heroesAt(
      browser,
      style,
      PHONE,
      true,
      HEADLINES.map((h) => `&header=${PHONE_HEADER}&headline=${encodeURIComponent(h)}`),
    );
    const [desktop] = await heroesAt(browser, style, DESKTOP, false, [""]);
    // one line per style: the numbers the report quotes, before and after a fix
    const slack = (h: Hero | null) => {
      if (!h?.h1 || !h.button) return null;
      const bottoms = [PHONE.height - h.h1.bottom, PHONE.height - h.button.bottom];
      // a photo below the type can slide down this far before its visible share drops under the minimum
      if (h.image && !(style in TYPE_LED)) bottoms.push(PHONE.height - h.image.top - MIN_PHOTO_SHARE * PHONE.height);
      return Math.round(Math.min(...bottoms) * 10) / 10;
    };
    console.log(
      `phone-first ${style} ${JSON.stringify({
        slack: Object.fromEntries(HEADLINES.map((h, i) => [h.length, slack(phones[i])])),
        phone: Object.fromEntries(HEADLINES.map((h, i) => [h.length, phones[i]])),
        desktop,
      })}`,
    );

    HEADLINES.forEach((headline, i) => {
      const phone = phones[i];
      const at = `phone (${headline.length} characters)`;
      expect(phone, `${at}: a hero renders`).not.toBeNull();
      expect(phone!.h1, `${at}: the hero has an h1`).not.toBeNull();
      // the params took effect: the spacer pushed the hero down, the headline is the one asked for
      // (toContain: terminal's h1 also holds its cursor)
      expect(phone!.h1!.top, `${at}: the ${PHONE_HEADER} px header spacer is above the hero`).toBeGreaterThanOrEqual(PHONE_HEADER);
      expect(phone!.h1!.text, `${at}: the h1 shows the headline`).toContain(headline);
      expect.soft(phone!.h1!.bottom, `${at}: h1 bottom within the first screen`).toBeLessThanOrEqual(PHONE.height);
      expect(phone!.button, `${at}: the hero has a link or button`).not.toBeNull();
      expect.soft(phone!.button!.top, `${at}: first button top on screen`).toBeGreaterThanOrEqual(0);
      expect.soft(phone!.button!.bottom, `${at}: first button bottom on screen`).toBeLessThanOrEqual(PHONE.height);
      if (style in TYPE_LED) {
        expect.soft(phone!.h1!.fontSize, `${at}: type-led h1 font-size (px)`).toBeGreaterThanOrEqual(TYPE_LED[style]);
      } else {
        expect(phone!.image, `${at}: the hero has a photo`).not.toBeNull();
        expect
          .soft(phone!.image!.shown, `${at}: photo height on the first screen (>= ${MIN_PHOTO_SHARE} x ${PHONE.height})`)
          .toBeGreaterThanOrEqual(MIN_PHOTO_SHARE * PHONE.height);
      }
    });

    // desktop
    expect(desktop, "desktop: a hero renders").not.toBeNull();
    expect(desktop!.h1, "desktop: the hero has an h1").not.toBeNull();
    expect.soft(desktop!.h1!.fontSize, "desktop: h1 font-size (px)").toBeGreaterThanOrEqual(MIN_DESKTOP_H1);
    expect(desktop!.button, "desktop: the hero has a link or button").not.toBeNull();
    expect.soft(desktop!.button!.bottom, "desktop: first button bottom within the first screen").toBeLessThanOrEqual(DESKTOP.height);
  });
}
