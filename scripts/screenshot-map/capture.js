// scripts/screenshot-map/capture.js
function resolveUrl(route, targets) {
  if (!route.dynamic) return { resolvedUrl: route.url, status: "ok" };
  const mapped = targets.dynamic && targets.dynamic[route.url];
  if (!mapped) {
    return { resolvedUrl: route.url, status: "skipped", note: "no target in targets.json" };
  }
  return { resolvedUrl: mapped, status: "ok" };
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
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "skipped", note: resolved.note, png: null, links: [] };
  }

  const page = await context.newPage();
  const url = `http://${route.host}${resolved.resolvedUrl}`;
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const httpStatus = resp ? resp.status() : 0;
    const finalUrl = page.url();
    const png = await page.screenshot({ fullPage: false });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
    );
    const c = classify({ httpStatus, finalUrl, role: route.role });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png, links };
  } catch (e) {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null, links: [] };
  } finally {
    await page.close();
  }
}

module.exports = { resolveUrl, classify, capturePage };
