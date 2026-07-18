// Captures one real screenshot per wizard catalog option (page layouts,
// hero styles, themes), per niche, from the hidden wizard-mockups scratch
// tenant (seed_wizard_mockup_tenant --niche <n>), and saves downscaled
// WebPs into frontend-main/public/wizard-mockups/<niche>/. Manual dev
// tool — re-run whenever demo content or page templates change.
//
// Prereqs: dev stack up (`make dev`) and demo media mirrored into dev
// MinIO (`make seed-demo-assets`). The scratch tenant is (re)seeded per
// niche by this script — no manual seeding step.
//
// Usage (from tools/wizard-mockups/):
//   npm run capture                       # all niches (~30-45 min)
//   npm run capture -- --niche belly_dance   # one niche while iterating

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, "..", "..", "frontend-main", "public", "wizard-mockups");
const VIEWPORT = { width: 1280, height: 960 };
const OUTPUT_WIDTH = 800; // downscaled width; height follows viewport aspect ratio
// Capture at 2x and let downscale() supersample — thumbnail text and photos
// come out visibly crisper than a 1x capture at the same output size.
const DEVICE_SCALE = 2;
const WEBP_QUALITY = 0.85;

// Mirrors backend/apps/demo_seed/data/ minus "general" (deliberately
// sparse — no plans, FAQ disabled — it would produce empty-state
// screenshots; the wizard maps it to the yoga set). Must stay in sync
// with MOCKUP_NICHES in packages/shared/src/wizard/mockups.ts.
const NICHES = ["belly_dance", "face_yoga", "fitness", "makeup", "pilates", "pole_dance", "yoga"];

// Mirrors backend/apps/core/onboarding/wizard_catalog.py PAGE_LAYOUTS.
const LAYOUTS = [
  { page: "home", id: "home-spotlight", path: "/" },
  { page: "home", id: "home-story", path: "/" },
  { page: "about", id: "about-story", path: "/about" },
  { page: "about", id: "about-portrait", path: "/about" },
  { page: "courses", id: "courses-grid", path: "/courses" },
  { page: "courses", id: "courses-guided", path: "/courses" },
  { page: "pricing", id: "pricing-simple", path: "/plans" },
  { page: "pricing", id: "pricing-reassure", path: "/plans" },
  { page: "faq", id: "faq-list", path: "/faq" },
  { page: "faq", id: "faq-welcoming", path: "/faq" },
  { page: "contact", id: "contact-form", path: "/contact" },
  { page: "contact", id: "contact-warm", path: "/contact" },
  { page: "home", id: "home-complete", path: "/" },
  { page: "about", id: "about-warm", path: "/about" },
  { page: "courses", id: "courses-social", path: "/courses" },
  { page: "pricing", id: "pricing-trust", path: "/plans" },
  { page: "faq", id: "faq-support", path: "/faq" },
  { page: "contact", id: "contact-reassure", path: "/contact" },
];

// Mirrors wizard_catalog.THEMES / HERO_STYLES.
const THEMES = ["ocean", "ember", "forest", "sunset", "violet", "slate"];
const HEROES = ["centered", "split", "minimal"];
// Hero cards only sell the top of the page — clip before downscaling.
const HERO_CLIP = { x: 0, y: 0, width: 1280, height: 640 };

function manage(args) {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", ...args],
    { cwd: join(__dirname, "..", ".."), stdio: "inherit" },
  );
}

const setLayout = (page, layoutId) => manage(["set_wizard_mockup_layout", page, layoutId]);
const setLook = (args) => manage(["set_wizard_mockup_look", ...args]);
const seedNiche = (niche) => manage(["seed_wizard_mockup_tenant", "--niche", niche]);

function nichesFromArgv() {
  const picked = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--niche") {
      const value = argv[++i];
      if (!NICHES.includes(value)) {
        throw new Error(`Unknown niche '${value}'. Available: ${NICHES.join(", ")}`);
      }
      picked.push(value);
    } else {
      throw new Error(`Unknown argument '${argv[i]}'. Usage: npm run capture [-- --niche <name>]`);
    }
  }
  return picked.length ? picked : NICHES;
}

/** Downscale + encode via an in-page canvas (no native image dependency —
 * same approach as tools/flowmap/crawler/thumbnail.js). */
async function downscale(page, pngBuffer, targetWidth) {
  const b64 = pngBuffer.toString("base64");
  const dataUrl = await page.evaluate(
    async ({ src, targetWidth, quality }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const scale = Math.min(1, targetWidth / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high"; // 2x-capture -> big ratio; default bilinear aliases
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", quality);
    },
    { src: b64, targetWidth, quality: WEBP_QUALITY },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function main() {
  const niches = nichesFromArgv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });
  const page = await context.newPage();
  // Broken media means a broken catalog card — refuse to write the file.
  // (The Jul 15 captures shipped broken-image icons because dev MinIO had
  // been wiped and every presigned demo photo 404'd.) Track failures at the
  // network layer so CSS background-image fetches count too, not just <img>.
  const failedMedia = new Set();
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if ((type === "image" || type === "media") && res.status() >= 400) {
      failedMedia.add(`${res.status()} ${res.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    const type = req.resourceType();
    if (type === "image" || type === "media") failedMedia.add(`FAILED ${req.url()}`);
  });
  // Belt-and-suspenders: disable Chromium's own HTTP cache too. The real fix
  // for stale layouts is per-layout domains (see seed_wizard_mockup_tenant) —
  // frontend-customer's fetchTenantConfig() keeps its own 60s in-memory
  // cache keyed by domain, independent of the browser and of Next's caching,
  // so two layouts sharing one domain would silently serve the first
  // layout's cached config for the second capture.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  async function capture(outDir, host, path, outName, { clip, fullPage = false } = {}) {
    failedMedia.clear();
    await page.goto(`http://${host}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    // Hide Next.js's dev-only overlay, same as tools/flowmap/crawler/capture.js.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    // Second net: <img> elements that attempted a load and got nothing
    // (complete && naturalWidth 0) — catches failures the response listener
    // can't attribute, without tripping on below-fold lazy images.
    const brokenImgs = await page.evaluate(() =>
      [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src || i.currentSrc),
    );
    if (failedMedia.size || brokenImgs.length) {
      const details = [...failedMedia, ...brokenImgs].join("\n  ");
      throw new Error(
        `${outName}: page has broken media — refusing to capture.\n  ${details}\n` +
          "Run `make seed-demo-assets` (mirrors demo photos/videos into dev MinIO), then retry.",
      );
    }
    const png = await page.screenshot(fullPage ? { fullPage: true } : { fullPage: false, ...(clip ? { clip } : {}) });
    const downscaled = await downscale(page, png, OUTPUT_WIDTH);
    writeFileSync(join(outDir, `${outName}.webp`), downscaled);
    console.log(`  -> ${outName}.webp`);
  }

  let written = 0;
  for (const niche of niches) {
    console.log(`\n=== ${niche} ===`);
    seedNiche(niche);
    const outDir = join(OUT_ROOT, niche);
    mkdirSync(outDir, { recursive: true });

    // fullPage: true — a viewport-only crop made two layouts that share their
    // first blocks (home-story/home-complete both open hero, imageText,
    // courseGrid) render byte-identical thumbnails, since the block that
    // actually distinguishes them sat below the fold. Capturing the whole
    // scrollable page makes every layout option provably distinct, no matter
    // which blocks a future option shares with an existing one.
    for (const { page: pageKey, id, path } of LAYOUTS) {
      console.log(`${id} ...`);
      setLayout(pageKey, id);
      await capture(outDir, `wm-${id}.localhost`, path, id, { fullPage: true });
    }

    for (const style of HEROES) {
      console.log(`hero-${style} ...`);
      setLook(["--hero", style]);
      await capture(outDir, `wm-hero-${style}.localhost`, "/", `hero-${style}`, { clip: HERO_CLIP });
    }
    // Reset home (hero back to centered, spotlight layout) before theme shots.
    setLayout("home", "home-spotlight");

    for (const theme of THEMES) {
      console.log(`theme-${theme} ...`);
      setLook(["--theme", theme]);
      await capture(outDir, `wm-theme-${theme}.localhost`, "/", `theme-${theme}`);
    }
    // No trailing look-reset: the next niche (or next run) reseeds the
    // scratch tenant from its template anyway.
    written += LAYOUTS.length + HEROES.length + THEMES.length;
  }

  await browser.close();
  console.log(`\nDone. ${written} screenshots written under ${OUT_ROOT}/<niche>/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
