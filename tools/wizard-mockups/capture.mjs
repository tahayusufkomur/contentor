// Captures one real screenshot per wizard page-layout option, from the
// hidden wizard-mockups scratch tenant (seed_wizard_mockup_tenant), and
// saves downscaled PNGs into frontend-main/public/wizard-mockups/. Manual
// dev tool — re-run whenever demo content or page templates change.
//
// Prereqs: dev stack up (`make dev`), scratch tenant seeded
// (`docker compose exec django python manage.py seed_wizard_mockup_tenant`).
//
// Usage: npm run capture   (from tools/wizard-mockups/)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "frontend-main", "public", "wizard-mockups");
const VIEWPORT = { width: 1280, height: 960 };
const OUTPUT_WIDTH = 800; // downscaled width; height follows viewport aspect ratio

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
];

function setLayout(page, layoutId) {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", "set_wizard_mockup_layout", page, layoutId],
    { cwd: join(__dirname, "..", ".."), stdio: "inherit" },
  );
}

/** Downscale via an in-page canvas (no native image dependency — same
 * approach as tools/flowmap/crawler/thumbnail.js). */
async function downscale(page, pngBuffer, targetWidth) {
  const b64 = pngBuffer.toString("base64");
  const dataUrl = await page.evaluate(
    async ({ src, targetWidth }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const scale = Math.min(1, targetWidth / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    },
    { src: b64, targetWidth },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  // Belt-and-suspenders: disable Chromium's own HTTP cache too. The real fix
  // for stale layouts is per-layout domains (see seed_wizard_mockup_tenant) —
  // frontend-customer's fetchTenantConfig() keeps its own 60s in-memory
  // cache keyed by domain, independent of the browser and of Next's caching,
  // so two layouts sharing one domain would silently serve the first
  // layout's cached config for the second capture.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  for (const { page: pageKey, id, path } of LAYOUTS) {
    console.log(`${id} ...`);
    setLayout(pageKey, id);
    await page.goto(`http://wm-${id}.localhost${path}`, { waitUntil: "networkidle", timeout: 30000 });
    // Hide Next.js's dev-only overlay, same as tools/flowmap/crawler/capture.js.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    const png = await page.screenshot({ fullPage: false });
    const downscaled = await downscale(page, png, OUTPUT_WIDTH);
    writeFileSync(join(OUT_DIR, `${id}.png`), downscaled);
    console.log(`  -> ${id}.png`);
  }

  await browser.close();
  console.log(`\nDone. ${LAYOUTS.length} screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
