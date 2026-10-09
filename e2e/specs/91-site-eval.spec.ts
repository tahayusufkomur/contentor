// Manual site-quality eval (docs/superpowers/specs/2026-10-04-stunning-pages-design.md
// → "Eval harness"): composes 12 fixture coaches' sites with the real composer
// on the site-eval scratch tenant, screenshots every page at 1440 and 390 px,
// runs deterministic checks, has the local `agy` CLI (Gemini) judge each
// page's screenshot pair, and writes an HTML gallery report.
// Excluded from the default suite: run `make eval-sites STYLE=<id>` (sets
// SITE_EVAL=1). Needs a live AI provider in the dev stack (`make ai-check`)
// and `agy` on the host. A heavy job: nothing else heavy alongside it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Browser, expect, test } from "@playwright/test";
import { manage } from "../helpers/compose";

type Brief = {
  id: string;
  brand: string;
  niche: string;
  description: string;
  followups?: { q: string; a: string }[];
  goals?: string[];
};
type ComposedPage = {
  key: string;
  path: string;
  status: string;
  fallback_sections: string[];
  empty_slots: string[];
};
type Shot = { width: number; file: string; issues: string[] };
type Judgement = {
  overall: number;
  notes: string;
  [criterion: string]: number | string;
};
type PageResult = {
  key: string;
  path: string;
  issues: string[];
  shots: Shot[];
  judge?: Judgement;
  judgeError?: string;
};
type BriefResult = { brief: Brief; error?: string; pages: PageResult[] };

const STYLE = process.env.STYLE ?? "";
const ONLY = (process.env.BRIEFS ?? "").split(",").filter(Boolean);
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "gemini-3.8-flash-high";
const RUN_DIR = path.join(
  __dirname,
  "..",
  "eval-shots",
  "sites",
  `${STYLE}-${process.env.SITE_EVAL_RUN ?? "latest"}`,
);
const WIDTHS = [1440, 390];
const PASS = { average: 8.5, floor: 7.5 };
const CRITERIA = {
  first_impression:
    "Does it look designed and premium at first glance, not assembled from a template?",
  hierarchy:
    "Is it obvious what matters? Headings, body text and calls to action read in the right order.",
  rhythm_whitespace:
    "Consistent spacing and section rhythm; no cramped blocks, no dead empty stretches.",
  image_quality_consistency:
    "Photos are sharp, well cropped, on-topic for this coach and consistent with each other in light and tone; no placeholders.",
  copy_specificity:
    "The words are specific to this coach and niche, not generic filler that would fit any business.",
  mobile:
    "The 390 px version works as a phone layout: nothing cut off, cramped or awkwardly stacked.",
};

const BRIEFS: Brief[] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "fixtures", "site-eval-briefs.json"),
    "utf8",
  ),
).filter((b: Brief) => !ONLY.length || ONLY.includes(b.id));

// Results live on disk, not in module state: Playwright restarts the worker
// after a failed test, and the report test must still see every brief.
const resultFile = (id: string) => path.join(RUN_DIR, id, "result.json");

async function capture(
  browser: Browser,
  url: string,
  file: string,
  width: number,
): Promise<Shot> {
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    // Final layout, not mid-animation: motion is CSS-only and motion-safe gated.
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const issues: string[] = [];
  try {
    const res = await page.goto(url, { waitUntil: "networkidle" });
    if (!res || res.status() >= 400)
      issues.push(`HTTP ${res?.status() ?? "no response"}`);
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    }); // dev badge
    // Scroll the whole page so lazy images load, then let them settle.
    await page.evaluate(async () => {
      for (
        let y = 0;
        y < document.documentElement.scrollHeight;
        y += window.innerHeight / 2
      ) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page
      .waitForFunction(
        // An image the page does not render (display:none on a phone) is never fetched: not broken.
        () =>
          Array.from(document.images).every(
            (i) => i.getClientRects().length === 0 || i.complete,
          ),
        null,
        {
          timeout: 20_000,
        },
      )
      .catch(() => {}); // still-loading images are reported as broken below
    const dom = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      broken: Array.from(document.images)
        .filter((i) => i.getClientRects().length > 0)
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.currentSrc || i.src),
      empty: document.querySelectorAll("[data-empty-image]").length,
    }));
    if (dom.overflow > 0) issues.push(`horizontal overflow: ${dom.overflow}px`);
    for (const src of dom.broken)
      issues.push(`broken image: ${src.slice(0, 120)}`);
    if (dom.empty) issues.push(`${dom.empty} empty image slot(s) rendered`);
    await page.screenshot({
      path: path.join(RUN_DIR, file),
      fullPage: true,
      type: "jpeg",
      quality: 80,
    });
    return { width, file, issues: issues.map((i) => `${width}px ${i}`) };
  } finally {
    await ctx.close();
  }
}

function judgePrompt(brief: Brief, pageKey: string, shots: Shot[]): string {
  const [desktop, mobile] = shots.map((s) => path.join(RUN_DIR, s.file));
  const coach = {
    brand: brief.brand,
    niche: brief.niche,
    description: brief.description,
  };
  return [
    "You are a senior web designer judging one page of a coach's website for a design-quality eval.",
    "Two full-length screenshots of the same page:",
    `- desktop, 1440 px wide: ${desktop}`,
    `- mobile, 390 px wide: ${mobile}`,
    "Open and look at both images in full before scoring. Do not create or edit any files.",
    "",
    `The site was generated for this coach: ${JSON.stringify(coach)}`,
    `Page: ${pageKey}. Site style: ${STYLE}.`,
    "",
    "Score each criterion from 1 to 10. Be strict: 8 means a professional designer would ship it",
    "unchanged; 10 is best-in-class (the top Framer, Webflow or Squarespace templates).",
    ...Object.entries(CRITERIA).map(([key, text]) => `- ${key}: ${text}`),
    "Then give an overall score (1-10) for the page as a whole.",
    "",
    "Reply with only this JSON object, nothing around it:",
    `{${Object.keys(CRITERIA)
      .map((k) => `"${k}": n`)
      .join(
        ", ",
      )}, "overall": n, "notes": "<at most 3 sentences, biggest problems first, concrete>"}`,
  ].join("\n");
}

function parseJudgement(text: string): Judgement {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in judge reply: ${text.slice(0, 200)}`);
  const raw = JSON.parse(match[0]);
  for (const key of [...Object.keys(CRITERIA), "overall"]) {
    const n = raw[key];
    if (typeof n !== "number" || n < 1 || n > 10)
      throw new Error(`bad ${key}: ${n}`);
  }
  return { ...raw, notes: String(raw.notes ?? "") };
}

function judge(brief: Brief, pageKey: string, shots: Shot[]): Judgement {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = execFileSync(
        "agy",
        [
          "-p",
          judgePrompt(brief, pageKey, shots),
          "--model",
          JUDGE_MODEL,
          "--mode",
          "plan",
          "--add-dir",
          RUN_DIR,
          "--output-format",
          "json",
          "--print-timeout",
          "5m",
        ],
        { cwd: RUN_DIR, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      const envelope = JSON.parse(out);
      if (envelope.status !== "SUCCESS")
        throw new Error(`agy status ${envelope.status}`);
      return parseJudgement(envelope.response);
    } catch (err) {
      last = String(err).slice(0, 500);
    }
  }
  throw new Error(last);
}

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

function verdict(results: BriefResult[]) {
  const failures: string[] = [];
  const scores: number[] = [];
  for (const r of results) {
    if (r.error) failures.push(`${r.brief.id}: ${r.error.slice(0, 300)}`);
    for (const p of r.pages) {
      const where = `${r.brief.id}/${p.key}`;
      for (const issue of p.issues) failures.push(`${where}: ${issue}`);
      if (!p.judge)
        failures.push(`${where}: unscored (${p.judgeError ?? "not judged"})`);
      else {
        scores.push(p.judge.overall);
        if (p.judge.overall < PASS.floor)
          failures.push(`${where}: overall ${p.judge.overall} < ${PASS.floor}`);
      }
    }
  }
  const average = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  if (average < PASS.average)
    failures.push(`average ${average.toFixed(2)} < ${PASS.average}`);
  return { failures, average, scores };
}

function writeReport(results: BriefResult[]): ReturnType<typeof verdict> {
  const v = verdict(results);
  const pages = results.flatMap((r) => r.pages);
  const clean = pages.filter((p) => !p.issues.length).length;
  const card = (p: PageResult) => {
    const [desk, mob] = p.shots;
    const rows = p.judge
      ? Object.keys(CRITERIA)
          .map(
            (k) =>
              `<tr><td>${k.replace(/_/g, " ")}</td><td>${p.judge![k]}</td></tr>`,
          )
          .join("")
      : "";
    const overall = p.judge?.overall;
    const tone =
      overall === undefined
        ? "bad"
        : overall < PASS.floor
          ? "bad"
          : overall < PASS.average
            ? "warn"
            : "ok";
    return `<article class="page">
  <header><h3>${esc(p.key)} <small>${esc(p.path)}</small></h3><span class="score ${tone}">${overall ?? "—"}</span></header>
  <div class="shots">
    ${desk ? `<a href="${esc(desk.file)}"><img src="${esc(desk.file)}" alt="${esc(p.key)} at 1440px" loading="lazy"></a>` : ""}
    ${mob ? `<a class="mob" href="${esc(mob.file)}"><img src="${esc(mob.file)}" alt="${esc(p.key)} at 390px" loading="lazy"></a>` : ""}
  </div>
  ${rows ? `<table>${rows}</table>` : ""}
  ${p.judge?.notes ? `<p class="notes">${esc(p.judge.notes)}</p>` : ""}
  ${p.judgeError ? `<p class="issue">judge failed: ${esc(p.judgeError)}</p>` : ""}
  ${p.issues.map((i) => `<p class="issue">${esc(i)}</p>`).join("")}
</article>`;
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Site eval: ${esc(STYLE)}</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--ok:#15803d;--warn:#b45309;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--card:#292524;--line:#44403c;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1280px;margin:0 auto}h1{margin:0 0 4px}.sum{color:var(--muted);margin:0 0 24px}
.verdict{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:600;color:#fff;background:var(--ok)}.verdict.fail{background:var(--bad)}
section{margin:40px 0}section>p{color:var(--muted);max-width:80ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}
.page{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.page header{display:flex;justify-content:space-between;align-items:baseline}.page h3{margin:0}.page small{color:var(--muted);font-weight:400}
.score{font-size:28px;font-weight:700}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.shots{display:flex;gap:8px;align-items:flex-start;margin:12px 0;height:420px;overflow:hidden}
.shots a{flex:3;height:100%;overflow:hidden;border:1px solid var(--line);border-radius:6px}.shots a.mob{flex:1}
.shots img{width:100%;display:block}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:2px 0;border-bottom:1px solid var(--line)}td+td{text-align:right;font-variant-numeric:tabular-nums}
.notes{font-size:14px}.issue{color:var(--bad);font-size:13px;margin:4px 0}
</style></head><body><main>
<h1>Site eval: ${esc(STYLE)} <span class="verdict ${v.failures.length ? "fail" : ""}">${v.failures.length ? "FAIL" : "PASS"}</span></h1>
<p class="sum">Run ${esc(process.env.SITE_EVAL_RUN ?? "latest")} · judge ${esc(JUDGE_MODEL)} · ${results.length} briefs ·
deterministic ${clean}/${pages.length} pages clean · average ${v.average.toFixed(2)} (bar ${PASS.average}) ·
lowest ${v.scores.length ? Math.min(...v.scores) : "—"} (floor ${PASS.floor})</p>
${v.failures.length ? `<details><summary>${v.failures.length} failure(s)</summary>${v.failures.map((f) => `<p class="issue">${esc(f)}</p>`).join("")}</details>` : ""}
${results
  .map(
    (
      r,
    ) => `<section><h2>${esc(r.brief.brand)} <small>${esc(r.brief.id)} · niche ${esc(r.brief.niche)}</small></h2>
<p>${esc(r.brief.description)}</p>
${r.error ? `<p class="issue">${esc(r.error)}</p>` : ""}
<div class="grid">${r.pages.map(card).join("")}</div></section>`,
  )
  .join("")}
</main></body></html>`;
  fs.writeFileSync(path.join(RUN_DIR, "report.html"), html);
  return v;
}

test.describe("site eval", () => {
  test.skip(
    !process.env.SITE_EVAL || !STYLE,
    "manual: make eval-sites STYLE=<id>",
  );
  test.describe.configure({ retries: 0 }); // a retry would recompose the whole site

  for (const brief of BRIEFS) {
    test(`${STYLE}: ${brief.id}`, async ({ browser }) => {
      test.setTimeout(45 * 60_000);
      fs.mkdirSync(path.join(RUN_DIR, brief.id), { recursive: true });
      const result: BriefResult = { brief, pages: [] };
      const save = () =>
        fs.writeFileSync(resultFile(brief.id), JSON.stringify(result, null, 2));
      try {
        const out = manage([
          "eval_compose_site",
          "--style",
          STYLE,
          "--brief",
          JSON.stringify(brief),
        ]);
        const composed: {
          host: string;
          plan_source: string;
          pages: ComposedPage[];
        } = JSON.parse(out.split("\n").pop()!);
        if (composed.plan_source !== "ai")
          result.error = `site plan fell back to the recipe (${composed.plan_source})`;
        for (const cp of composed.pages) {
          const page: PageResult = {
            key: cp.key,
            path: cp.path,
            shots: [],
            issues: [
              ...(cp.status === "ready" ? [] : [`page build ${cp.status}`]),
              ...cp.fallback_sections.map((f) => `fallback copy in ${f}`),
              ...cp.empty_slots.map((s) => `empty photo slot ${s}`),
            ],
          };
          result.pages.push(page);
          for (const width of WIDTHS) {
            const file = path.join(brief.id, `${cp.key}-${width}.jpg`);
            const shot = await capture(
              browser,
              `http://${composed.host}${cp.path}`,
              file,
              width,
            );
            page.shots.push(shot);
            page.issues.push(...shot.issues);
          }
          try {
            page.judge = judge(brief, cp.key, page.shots);
          } catch (err) {
            page.judgeError = String(err).slice(0, 500);
          }
          save();
        }
      } catch (err) {
        result.error = String(err).slice(0, 2000);
        throw err;
      } finally {
        save();
      }
    });
  }

  test(`${STYLE}: report + pass bar`, async () => {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    const results = BRIEFS.map((brief): BriefResult => {
      const file = resultFile(brief.id);
      return fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : { brief, error: "not run", pages: [] };
    });
    const v = writeReport(results);
    console.log(`site eval report: ${path.join(RUN_DIR, "report.html")}`);
    expect(v.failures, `average ${v.average.toFixed(2)}`).toEqual([]);
  });
});
