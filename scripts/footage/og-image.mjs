#!/usr/bin/env node
// Renders the share card (og:image / twitter:image) to frontend-main/public/og.jpg
// from the hero still and the brand lockup. Run from the repo root after the
// hero still or the landing's headline changes:
//   node scripts/footage/og-image.mjs
// The mark's paths mirror frontend-main/src/components/shared/logo-mark.tsx.
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "../../e2e/node_modules/playwright/index.mjs";

const ROOT = process.cwd();
const font = (w) =>
  `file://${path.join(ROOT, "frontend-main/node_modules/geist/dist/fonts/geist-sans", `Geist-${w}.woff2`)}`;
// Inline: a page built with setContent has no origin, so file:// images do not load.
const hero = `data:image/avif;base64,${readFileSync(path.join(ROOT, "frontend-main/public/media/stills/hero-coach.avif")).toString("base64")}`;
const OUT = path.join(ROOT, "frontend-main/public/og.jpg");

const mark = `<svg viewBox="0 0 32 32" style="width:44px;height:44px">
  <rect width="32" height="32" rx="8" fill="#171614"/>
  <g fill="none" stroke-width="4.6" stroke-linecap="round" transform="translate(16 16) scale(0.72) translate(-16 -16)">
    <path d="M24.043 9.251A10.5 10.5 0 1 0 12.409 25.867" stroke="#f5f3ef"/>
    <path d="M12.409 25.867A10.5 10.5 0 0 0 24.043 22.749" stroke="#e1ad63"/></g></svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url(${font("SemiBold")});font-weight:600}
@font-face{font-family:Geist;src:url(${font("Regular")});font-weight:400}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fff;color:#171614;font-family:Geist,system-ui;display:flex;overflow:hidden}
.copy{width:640px;padding:64px 0 64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.lockup{display:flex;align-items:center;gap:16px;font-size:36px;font-weight:600;letter-spacing:-.02em}
.lockup b{color:#975800;font-weight:600}
h1{font-size:62px;line-height:1.04;letter-spacing:-.03em;font-weight:600;max-width:540px}
p{font-size:23px;line-height:1.4;color:#5d5a55;max-width:500px;margin-top:22px}
.photo{position:absolute;left:640px;top:0;width:560px;height:630px;overflow:hidden;border-radius:36px 0 0 36px}
.photo img{width:100%;height:100%;object-fit:cover;object-position:62% 50%}
</style>
<div class="copy">
  <div class="lockup">${mark}<span>Content<b>or</b></span></div>
  <div><h1>Teach what you love, and make a living from it.</h1>
  <p>Your own site, classes students come back to, and payments that go straight to you.</p></div>
</div>
<div class="photo"><img src="${hero}" alt=""></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html);
await page.waitForFunction(
  () => document.images[0]?.complete && document.images[0].naturalWidth > 0,
);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
await browser.close();
console.log("wrote", path.relative(ROOT, OUT));
