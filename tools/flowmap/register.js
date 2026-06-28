// tools/flowmap/register.js
const path = require("node:path");
const { execSync, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const frontends = require("./crawler/frontends");
const targets = require("./crawler/targets.json");
const { discover } = require("./crawler/discover");
const { getContext } = require("./crawler/auth");
const { capturePage } = require("./crawler/capture");
const { makeImages } = require("./crawler/thumbnail");
const { buildGraph } = require("./crawler/graph");
const { buildPrompt, parseFlows } = require("./flows");
const { open } = require("./db");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(__dirname, "flowmap.db");

function preflight() {
  for (const host of new Set(frontends.map((f) => f.host))) {
    try {
      execSync(`curl -s --max-time 8 -o /dev/null -H "Host: ${host}" http://localhost/`, { timeout: 10000 });
    } catch {
      console.error(`✗ ${host} not reachable via Caddy. Run: make dev && make seed && make seed-demos`);
      process.exit(1);
    }
  }
}

async function main() {
  preflight();
  const db = open(DB_PATH);
  if (process.argv.includes("--reset")) db.reset();

  const browser = await chromium.launch();
  const resizePage = await browser.newPage();
  const results = [];
  const routesByFrontend = {};
  try {
    for (const fe of frontends) {
      const routes = discover(fe, REPO_ROOT);
      routesByFrontend[fe.name] = routes;
      const roles = [...new Set(routes.map((r) => r.role))];
      const contexts = {};
      for (const role of roles) contexts[role] = await getContext(browser, { role, host: fe.host, tenantSlug: targets.tenantSlug });
      for (const route of routes) {
        const res = await capturePage(contexts[route.role], route, targets);
        let thumb = null, full = null;
        if (res.png) { const imgs = await makeImages(resizePage, res.png); thumb = imgs.thumb; full = imgs.full; }
        const key = `${res.frontend}|${res.url}`;
        db.upsertScreen({ key, url: res.url, role: res.role, frontend: res.frontend, title: res.title || null, thumb, full });
        results.push(res);
        process.stdout.write(`· ${key} ${res.status}\n`);
      }
      for (const role of roles) await contexts[role].close();
    }
  } finally {
    await browser.close();
  }

  // Report capture coverage — the goal is 0 skipped / 0 errored (every route a real screenshot).
  const bad = results.filter((r) => r.status !== "ok");
  console.log(`\nCapture: ${results.length - bad.length}/${results.length} ok` + (bad.length ? `, ${bad.length} not-ok:` : " — 100% coverage"));
  for (const r of bad) console.log(`  ⚠ ${r.frontend}|${r.url} [${r.status}] ${r.note}`);

  // --screens-only refreshes every screen's screenshot but keeps the existing (verified) flows;
  // without it we (re-)identify flows via the claude CLI.
  if (process.argv.includes("--screens-only")) {
    console.log(`\n✓ Refreshed ${results.length} screens (flows untouched) in ${DB_PATH}`);
    db.close();
    return;
  }

  const graph = buildGraph(results, routesByFrontend);
  const titleByKey = Object.fromEntries(results.map((r) => [`${r.frontend}|${r.url}`, r.title || ""]));
  const screens = graph.nodes.map((n) => ({ key: n.id, url: n.label, role: n.role, title: titleByKey[n.id] || "" }));
  const prompt = buildPrompt(screens, graph.edges);

  console.log(`\nAsking claude to identify flows over ${screens.length} screens / ${graph.edges.length} links …`);
  let out = "";
  try {
    out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    console.error("claude CLI failed:", String((e && e.stderr) || (e && e.message) || e));
  }
  const { flows, warnings } = parseFlows(out, screens.map((s) => s.key));
  for (const f of flows) db.createFlow(f);
  warnings.slice(0, 12).forEach((w) => console.warn("  ⚠ " + w));
  console.log(`\n✓ Registered ${screens.length} screens and ${flows.length} flows into ${DB_PATH}`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
