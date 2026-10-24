// The phone-first contract (docs/superpowers/specs/2026-10-24-site-styles-wow-design.md, R4):
// coach traffic lands on phones, so on 390x844 the first screen of every style's home hero
// shows the photo (or the giant type), the H1 and the primary button. One test per enabled
// style, named by the style id, so a failure names the style. Reads the design showcase on
// the demo tenant with the content a composed site really carries (size=real, fixture=yoga:
// no hero meta, no second button). No sign-in, no data written.
//
//   phone  390x844   h1 bottom <= 844; the first link/button fully inside 0..844;
//                    the largest hero image shows >= 0.4 * 844 px of its height on screen.
//                    Type-led exception (no photo): manuscript's h1 is at least 44px.
//   desktop 1440x900 h1 >= 72px; the first button's bottom <= 900.
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

async function heroAt(browser: Browser, style: string, view: { width: number; height: number }, phone: boolean) {
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
    await page.goto(
      `http://demo-yoga.localhost/design-showcase?style=${style}&page=home&bare=1&size=real&fixture=yoga`,
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    await page.waitForSelector('[data-showcase^="hero."]', { timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    return await page.evaluate(measure, view.height);
  } finally {
    await ctx.close();
  }
}

test.describe.configure({ retries: 0 }); // layout numbers do not flake; a retry would only hide a first-compile timeout
test.setTimeout(150_000);

for (const style of STYLE_IDS) {
  test(style, async ({ browser }) => {
    const phone = await heroAt(browser, style, PHONE, true);
    const desktop = await heroAt(browser, style, DESKTOP, false);
    // one line per style: the numbers the report quotes, before and after a fix
    console.log(`phone-first ${style} ${JSON.stringify({ phone, desktop })}`);

    expect(phone, "phone: a hero renders").not.toBeNull();
    expect(desktop, "desktop: a hero renders").not.toBeNull();

    // phone
    expect(phone!.h1, "phone: the hero has an h1").not.toBeNull();
    expect.soft(phone!.h1!.bottom, "phone: h1 bottom within the first screen").toBeLessThanOrEqual(PHONE.height);
    expect(phone!.button, "phone: the hero has a link or button").not.toBeNull();
    expect.soft(phone!.button!.top, "phone: first button top on screen").toBeGreaterThanOrEqual(0);
    expect.soft(phone!.button!.bottom, "phone: first button bottom on screen").toBeLessThanOrEqual(PHONE.height);
    if (style in TYPE_LED) {
      expect.soft(phone!.h1!.fontSize, "phone: type-led h1 font-size (px)").toBeGreaterThanOrEqual(TYPE_LED[style]);
    } else {
      expect(phone!.image, "phone: the hero has a photo").not.toBeNull();
      expect
        .soft(phone!.image!.shown, `phone: photo height on the first screen (>= ${MIN_PHOTO_SHARE} x ${PHONE.height})`)
        .toBeGreaterThanOrEqual(MIN_PHOTO_SHARE * PHONE.height);
    }

    // desktop
    expect(desktop!.h1, "desktop: the hero has an h1").not.toBeNull();
    expect.soft(desktop!.h1!.fontSize, "desktop: h1 font-size (px)").toBeGreaterThanOrEqual(MIN_DESKTOP_H1);
    expect(desktop!.button, "desktop: the hero has a link or button").not.toBeNull();
    expect.soft(desktop!.button!.bottom, "desktop: first button bottom within the first screen").toBeLessThanOrEqual(DESKTOP.height);
  });
}
