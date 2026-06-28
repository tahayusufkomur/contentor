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

function classify({ httpStatus, finalUrl, role }) {
  if (httpStatus >= 400) return { status: "error", note: `HTTP ${httpStatus}` };
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
    const waitUntil = waitStrategy(resolved.resolvedUrl);
    const resp = await page.goto(url, { waitUntil, timeout: 30000 });
    if (waitUntil === "domcontentloaded") await page.waitForTimeout(2500); // let the join/landing UI paint
    const httpStatus = resp ? resp.status() : 0;
    const finalUrl = page.url();
    const png = await page.screenshot({ fullPage: false });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
    );
    const title = await page.evaluate(() => document.title || "");
    const c = classify({ httpStatus, finalUrl, role: route.role });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png, links, title };
  } catch (e) {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null, links: [], title: null };
  } finally {
    await page.close();
  }
}

module.exports = { resolveUrl, classify, capturePage };
