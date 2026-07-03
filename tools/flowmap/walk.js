// tools/flowmap/walk.js — live-walk one flow end-to-end to VERIFY every step renders a
// real screenshot (no skip / no error / no auth-redirect). Reads the flow from flowmap.db,
// logs in per role, navigates each screen to its concrete URL (targets.json), screenshots
// to a folder for inspection, and prints a per-step JSON report. Exits non-zero on any gap.
//
// Usage: node --experimental-sqlite walk.js <flowId> [outDir]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const targets = require("./crawler/targets.json");
const { getContext } = require("./crawler/auth");
const { resolveUrl, classify, isSiteNotFound } = require("./crawler/capture");
const { open } = require("./db");

const DB_PATH = path.join(__dirname, "flowmap.db");
const SLOW = [/\/live\//, /\/live-stream\//];

function hostFor(frontend) {
  return frontend === "main" ? targets.mainHost : targets.tenantHost;
}
function routeFromKey(key, role) {
  const i = key.indexOf("|");
  const frontend = key.slice(0, i);
  const url = key.slice(i + 1);
  return { frontend, url, role, dynamic: /\[[^\]]+\]/.test(url), host: hostFor(frontend) };
}
function safe(key) {
  return key.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

async function main() {
  const flowId = Number(process.argv[2]);
  if (!flowId) {
    console.error("usage: node --experimental-sqlite walk.js <flowId> [outDir]");
    process.exit(2);
  }
  const outDir = process.argv[3] || path.join(__dirname, "walk-shots", `flow-${flowId}`);
  fs.mkdirSync(outDir, { recursive: true });

  const db = open(DB_PATH);
  const flow = db.getFlow(flowId);
  db.close();
  if (!flow) {
    console.error(`no flow ${flowId} in ${DB_PATH} (run make flowmap-register first)`);
    process.exit(2);
  }

  // Unique screens in step order: walk from->to across steps.
  const order = [];
  const seen = new Set();
  for (const st of flow.steps) for (const k of [st.from, st.to]) {
    if (!seen.has(k)) { seen.add(k); order.push(k); }
  }
  const roleByKey = Object.fromEntries(flow.screens.map((s) => [s.key, s.role || "anon"]));

  const browser = await chromium.launch();
  const contexts = {};
  const report = { flowId, name: flow.name, steps: [], ok: 0, bad: 0 };
  try {
    for (const key of order) {
      const role = roleByKey[key] || "anon";
      const route = routeFromKey(key, role);
      const resolved = resolveUrl(route, targets);
      const rec = { key, role, resolvedUrl: resolved.resolvedUrl, status: resolved.status, note: resolved.note || "" };
      if (resolved.status === "skipped") {
        rec.note = "no concrete instance in targets.json for this dynamic route";
        report.bad++; report.steps.push(rec); continue;
      }
      if (!contexts[role]) contexts[role] = await getContext(browser, { role, host: route.host, tenantSlug: targets.tenantSlug });
      const page = await contexts[role].newPage();
      try {
        const waitUntil = SLOW.some((re) => re.test(resolved.resolvedUrl)) ? "domcontentloaded" : "networkidle";
        // Mirror capture.js: retry a transient "Site not found" before trusting it.
        let resp = null;
        let notFound = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          resp = await page.goto(`http://${route.host}${resolved.resolvedUrl}`, { waitUntil, timeout: 30000 });
          if (waitUntil === "domcontentloaded") await page.waitForTimeout(2500);
          notFound = await isSiteNotFound(page);
          if (!notFound || attempt === 3) break;
          await page.waitForTimeout(1500);
        }
        const c = classify({ httpStatus: resp ? resp.status() : 0, finalUrl: page.url(), role, notFound });
        rec.status = c.status; rec.note = c.note || ""; rec.httpStatus = resp ? resp.status() : 0; rec.finalUrl = page.url();
        await page.screenshot({ path: path.join(outDir, safe(key) + ".png") });
      } catch (e) {
        rec.status = "error"; rec.note = String(e.message || e).slice(0, 120);
      } finally {
        await page.close();
      }
      rec.status === "ok" ? report.ok++ : report.bad++;
      report.steps.push(rec);
    }
  } finally {
    for (const c of Object.values(contexts)) await c.close();
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  console.error(`\nflow #${flowId} "${flow.name}": ${report.ok} ok / ${report.bad} bad · shots in ${outDir}`);
  process.exit(report.bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
