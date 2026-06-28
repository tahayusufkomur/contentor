// scripts/screenshot-map/index.js
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { chromium } = require("playwright");

const frontends = require("./frontends");
const targets = require("./targets.json");
const { discover } = require("./discover");
const { getContext } = require("./auth");
const { capturePage } = require("./capture");
const { render, summarize } = require("./render");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "screenshot-map");

function preflight() {
  for (const host of new Set(frontends.map((f) => f.host))) {
    try {
      // Caddy routes by Host header; curl localhost so we don't depend on *.localhost DNS.
      execSync(`curl -s --max-time 8 -o /dev/null -H "Host: ${host}" http://localhost/`, { timeout: 10000 });
    } catch {
      console.error(`✗ ${host} not reachable via Caddy. Run: make dev && make seed && make seed-demos`);
      process.exit(1);
    }
  }
}

async function main() {
  preflight();
  const browser = await chromium.launch();
  const results = [];

  try {
    for (const fe of frontends) {
      const routes = discover(fe, REPO_ROOT);
      const roles = [...new Set(routes.map((r) => r.role))];
      const contexts = {};
      for (const role of roles) {
        contexts[role] = await getContext(browser, { role, host: fe.host, tenantSlug: targets.tenantSlug });
      }
      for (const route of routes) {
        process.stdout.write(`· ${fe.name} ${route.url} … `);
        const res = await capturePage(contexts[route.role], route, targets);
        console.log(res.status);
        results.push(res);
      }
      for (const role of roles) await contexts[role].close();
    }
  } finally {
    await browser.close();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
  const html = render(results, {
    generatedAt: new Date().toISOString(),
    commit,
    summary: summarize(results),
  });
  const outFile = path.join(OUT_DIR, "index.html");
  fs.writeFileSync(outFile, html);
  console.log(`\n✓ Map written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
