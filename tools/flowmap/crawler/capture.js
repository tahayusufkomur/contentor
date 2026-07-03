// scripts/screenshot-map/capture.js
function resolveUrl(route, targets) {
  if (!route.dynamic) return { resolvedUrl: route.url, status: "ok" };
  // Dynamic routes resolve to a concrete instance from targets.dynamic. The same URL
  // (e.g. /admin/m/[model]) can mean different things per frontend, so a per-frontend
  // nested map (targets.dynamic[frontend][url]) wins over the flat map (targets.dynamic[url]).
  const d = targets.dynamic || {};
  const perFrontend = route.frontend && d[route.frontend] && d[route.frontend][route.url];
  const mapped = perFrontend || d[route.url];
  if (!mapped) {
    return { resolvedUrl: route.url, status: "skipped", note: "no target in targets.json" };
  }
  return { resolvedUrl: mapped, status: "ok" };
}

// Routes whose page never reaches networkidle (e.g. a live video SDK holding the
// connection open) hang on the default wait. They're listed here so capture falls back
// to "domcontentloaded" and snapshots the join/landing screen the user actually sees.
const SLOW_LOAD = [/\/live\//, /\/live-stream\//];
function waitStrategy(resolvedUrl) {
  return SLOW_LOAD.some((re) => re.test(resolvedUrl)) ? "domcontentloaded" : "networkidle";
}

// The customer app renders a "Site not found" fallback (HTTP 200) when the tenant
// config can't be resolved server-side — which happens on transient config-fetch
// failures under load, not just for genuinely-unknown tenants. Detect it by its
// unique copy so it's never mistaken for a real page.
const SITE_NOT_FOUND_MARKER = "no Contentor site at this address";
async function isSiteNotFound(page) {
  return page
    .evaluate((marker) => document.body?.innerText?.includes(marker) ?? false, SITE_NOT_FOUND_MARKER)
    .catch(() => false);
}

function classify({ httpStatus, finalUrl, role, notFound }) {
  if (httpStatus >= 400) return { status: "error", note: `HTTP ${httpStatus}` };
  if (notFound) return { status: "error", note: "tenant not resolved (Site not found)" };
  if (role !== "anon" && /\/login(\/|$|\?|#)/i.test(finalUrl)) {
    return { status: "error", note: "redirected to login (auth failed)" };
  }
  return { status: "ok", note: "" };
}

async function capturePage(context, route, targets) {
  const resolved = resolveUrl(route, targets);
  if (resolved.status === "skipped") {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "skipped", note: resolved.note, png: null, links: [], title: null };
  }

  const page = await context.newPage();
  const url = `http://${route.host}${resolved.resolvedUrl}`;
  try {
    // Some pages render purely from client state (e.g. /checkout reads the cart
    // from localStorage). Seed that state before navigating so they capture a
    // populated screen instead of an empty state. addInitScript runs before the
    // page's own scripts on the upcoming navigation, scoped to this page only.
    const seed = (targets.localStorage || {})[`${route.frontend}|${route.url}`];
    if (seed) {
      await page.addInitScript((data) => {
        for (const [k, v] of Object.entries(data)) {
          localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        }
      }, seed);
    }
    const waitUntil = waitStrategy(resolved.resolvedUrl);
    // A "Site not found" render is usually a transient tenant-config-fetch miss, so
    // reload a couple times before accepting it — that keeps a flaky moment under
    // load from poisoning the stored screenshot. If it survives every attempt, the
    // tenant genuinely doesn't resolve and classify() flags it as an error.
    let resp = null;
    let notFound = false;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      resp = await page.goto(url, { waitUntil, timeout: 30000 });
      if (waitUntil === "domcontentloaded") await page.waitForTimeout(2500); // let the join/landing UI paint
      notFound = await isSiteNotFound(page);
      if (!notFound || attempt === maxAttempts) break;
      await page.waitForTimeout(1500);
    }
    const httpStatus = resp ? resp.status() : 0;
    const finalUrl = page.url();
    // The flow map is a visual map of the app, not a QA view — hide Next.js's
    // dev-only overlay (the "N errors" indicator / error modal, rendered in
    // <nextjs-portal>) so dev-server chrome (e.g. the HMR-websocket warning on
    // tenant subdomains) never appears in the screenshots.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    const png = await page.screenshot({ fullPage: false });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
    );
    const title = await page.evaluate(() => document.title || "");
    const c = classify({ httpStatus, finalUrl, role: route.role, notFound });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png, links, title };
  } catch (e) {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null, links: [], title: null };
  } finally {
    await page.close();
  }
}

module.exports = { resolveUrl, classify, capturePage, isSiteNotFound };
