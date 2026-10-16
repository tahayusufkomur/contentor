#!/usr/bin/env node
// Renders the share card (og:image / twitter:image) to frontend-main/public/og.jpg
// from the hero's creator photo and the brand lockup. Run from the repo root after the
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
const hero = `data:image/avif;base64,${readFileSync(path.join(ROOT, "frontend-main/public/media/stills/screens-creator.avif")).toString("base64")}`;
const OUT = path.join(ROOT, "frontend-main/public/og.jpg");

const mark = `<svg class="mark" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#171614"/>
  <g fill="none" stroke-width="4.6" stroke-linecap="round" transform="translate(16 16) scale(0.72) translate(-16 -16)">
    <path d="M24.043 9.251A10.5 10.5 0 1 0 12.409 25.867" stroke="#f5f3ef"/>
    <path d="M12.409 25.867A10.5 10.5 0 0 0 24.043 22.749" stroke="#e1ad63"/></g></svg>`;
// The last "o" as a play button, as logo-mark.tsx PlayO draws it.
const playO = `<svg class="playo" viewBox="0 0 578 558">
  <path fill-rule="evenodd" d="M39 279a262.5 279 0 1 0 525 0a262.5 279 0 1 0 -525 0ZM151 279a150.5 167 0 1 0 301 0a150.5 167 0 1 0 -301 0Z"/>
  <path d="M243.5 191L401.5 279L243.5 367Z"/></svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url(${font("SemiBold")});font-weight:600}
@font-face{font-family:Geist;src:url(${font("Regular")});font-weight:400}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fff;color:#171614;font-family:Geist,system-ui;display:flex;overflow:hidden}
.copy{width:640px;padding:64px 0 64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.lockup{font-size:36px;font-weight:600;letter-spacing:-.02em;white-space:nowrap}
.lockup .mark{display:inline-block;width:1.3em;height:1.3em;margin-right:.08em;vertical-align:-.3em}
.lockup b{color:#975800;font-weight:600}
.lockup .playo{display:inline-block;width:.578em;height:.558em;vertical-align:-.012em;fill:currentColor}
h1{font-size:54px;line-height:1.05;letter-spacing:-.03em;font-weight:600;max-width:560px}
h1 span{display:block;color:#975800}
p{font-size:23px;line-height:1.4;color:#5d5a55;max-width:500px;margin-top:22px}
.photo{position:absolute;left:640px;top:0;width:560px;height:630px;overflow:hidden;border-radius:36px 0 0 36px}
.photo img{width:100%;height:100%;object-fit:cover;object-position:50% 45%}
</style>
<div class="copy">
  <div class="lockup">${mark}ontent<b>${playO}r</b></div>
  <div><h1>You're the expert. <span>We're your whole team.</span></h1>
  <p>Your site, your students and your payments, handled. You just create.</p></div>
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
