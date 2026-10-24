// Capture the first screen (fold) and the full page of every site style's home recipe,
// optionally real tenants and award-site references, desktop + phone, plus an index.html.
// Run through `make design-shots` (STYLES=a,b TENANTS=slug,slug REFS=1 FIXTURE=<set> LABEL=<text>).
// Last output line is the run folder: e2e/eval-shots/design/<YYYYMMDD-HHMM>[-<LABEL>]/ (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES_DIR = path.resolve(E2E, "../packages/shared/src/sections/styles");
const list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const VIEWS = [
  { name: "d", width: 1440, height: 900 },
  { name: "m", width: 390, height: 844, mobile: true },
];

// styles: every enabled manifest, or the STYLES list (checked, the showcase falls back to
// the first style on an unknown id and would silently shoot the wrong one)
const manifests = fs
  .readdirSync(STYLES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), "utf8")));
const asked = list(process.env.STYLES);
const unknown = asked.filter((s) => !manifests.some((m) => m.id === s));
if (unknown.length) {
  console.error(`unknown style(s): ${unknown.join(", ")}`);
  process.exit(2);
}
const styles = asked.length ? asked : manifests.filter((m) => m.enabled).map((m) => m.id);
const tenants = list(process.env.TENANTS);
const withRefs = !!process.env.REFS && process.env.REFS !== "0";
const refs = withRefs
  ? JSON.parse(fs.readFileSync(path.join(E2E, "fixtures/design-refs.json"), "utf8"))
  : [];
const fixture = process.env.FIXTURE ? `&size=real&fixture=${encodeURIComponent(process.env.FIXTURE)}` : "";

const now = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`;
const label = (process.env.LABEL ?? "").replace(/[^\w.-]+/g, "-");
const OUT = path.join(E2E, "eval-shots/design", label ? `${stamp}-${label}` : stamp);

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500); // entrance animations run on load
}

// Walk the page so lazy images and scroll reveals fire, then return to the top.
async function walk(page) {
  await page.addStyleTag({ content: "html,body{scroll-behavior:auto!important}" });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = await page.evaluate(() => window.innerHeight * 0.8);
  for (let y = 0; y < h; y += step) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y);
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

let failed = 0;
// an error page (unknown tenant, bot check, dev compile error) is a failure, not a screenshot
const got = (res) => {
  if (res && !res.ok()) throw new Error(`HTTP ${res.status()}`);
};

// kind "page": fold + full; kind "ref": fold only, after the loaders (7000 ms), reference locale.
// Desktop and phone run side by side (two fresh contexts), which halves the wall time.
async function shoot(browser, url, base, kind = "page") {
  await Promise.all(VIEWS.map(async (v) => {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 1,
      isMobile: !!v.mobile,
      hasTouch: !!v.mobile,
      colorScheme: "light",
      ...(kind === "ref" && { locale: "en-US" }),
    });
    const page = await ctx.newPage();
    try {
      if (kind === "ref") {
        await got(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }));
        await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
        await page.waitForTimeout(7000); // intro loaders and entrance motion
      } else {
        await got(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }));
        await settle(page);
      }
      await page.screenshot({ path: `${base}-${v.name}-fold.jpg`, type: "jpeg", quality: 82 });
      if (kind === "page") {
        await walk(page);
        await page.screenshot({ path: `${base}-${v.name}-full.jpg`, type: "jpeg", quality: 72, fullPage: true });
      }
      console.log("ok", path.relative(OUT, base), v.name);
    } catch (e) {
      failed++;
      console.log("FAIL", path.relative(OUT, base), v.name, String(e).slice(0, 200));
    }
    await ctx.close();
  }));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function table(title, dir, rows, full) {
  const img = (f, w) => (fs.existsSync(path.join(OUT, dir, f)) ? `<a href="${dir}/${f}"><img src="${dir}/${f}" width="${w}"></a>` : "<i>missing</i>");
  const link = (f, text) => (fs.existsSync(path.join(OUT, dir, f)) ? `<a href="${dir}/${f}">${text}</a>` : "");
  const body = rows
    .map(
      ({ id, name }) =>
        `<tr><th>${esc(name ?? id)}</th><td>${img(`${id}-d-fold.jpg`, 480)}</td><td>${img(`${id}-m-fold.jpg`, 180)}</td>` +
        (full ? `<td>${link(`${id}-d-full.jpg`, "desktop full")}<br>${link(`${id}-m-full.jpg`, "phone full")}</td>` : "") +
        "</tr>",
    )
    .join("\n");
  return `<h2>${title}</h2>\n<table><tr><th></th><th>desktop fold</th><th>phone fold</th>${full ? "<th>full page</th>" : ""}</tr>\n${body}\n</table>`;
}

fs.mkdirSync(OUT, { recursive: true });
const started = Date.now();
const browser = await chromium.launch();
for (const s of styles) {
  const url = `http://demo-yoga.localhost/design-showcase?style=${s}&page=home&bare=1${fixture}`;
  await shoot(browser, url, path.join(OUT, "styles", s));
}
for (const slug of tenants) await shoot(browser, `http://${slug}.localhost/`, path.join(OUT, "tenants", slug));
for (const r of refs) await shoot(browser, r.url, path.join(OUT, "refs", r.id), "ref");
await browser.close();

const sections = [
  styles.length && table("Styles", "styles", styles.map((id) => ({ id })), true),
  tenants.length && table("Tenants", "tenants", tenants.map((id) => ({ id })), true),
  refs.length && table("References", "refs", refs.map((r) => ({ id: r.id, name: r.label })), false),
].filter(Boolean);
fs.writeFileSync(
  path.join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>design-shots ${esc(path.basename(OUT))}</title>
<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}th,td{padding:6px;vertical-align:top;text-align:left}img{display:block;border:1px solid #ccc}</style>
<h1>${esc(path.basename(OUT))}${fixture ? ` <small>(${esc(fixture.slice(1))})</small>` : ""}</h1>
${sections.join("\n")}
`,
);
console.log(`done in ${Math.round((Date.now() - started) / 1000)}s, ${failed} failed`);
if (failed) process.exitCode = 1;
console.log(OUT);
