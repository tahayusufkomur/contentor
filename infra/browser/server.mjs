// Screenshot service for the site's final visual check
// (backend/apps/tenant_config/site_qa.py). Internal network only: no port is
// published.
//
//   POST /capture {url, width, theme?, cookies?}
//     -> {status, theme, height, issues: [..], tiles: [<base64 jpeg>, ..]}
//   The page top to bottom, cut into strips a vision model reads at full
//   size (a whole page in one image would be scaled down to a blur).
//   GET /health
//
// HOST_RULES   Chromium --host-resolver-rules, so tenant hosts reach Caddy
//              from inside the network ("MAP *.localhost caddy").
// ALLOW_HOSTS  internal hosts a page may load from besides its own (dev
//              object storage: "localhost").
import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import { chromium } from "playwright";

const PORT = 3000;
const MAX_TILES = 8; // a longer page is cut there
const tileHeight = (mobile) => (mobile ? 1688 : 1600);
const ALLOW_HOSTS = new Set(
  (process.env.ALLOW_HOSTS ?? "").split(",").filter(Boolean),
);

// The pages are tenant-written (rich text takes any <img src>): nothing a
// page loads may reach this network's own services.
const PRIVATE = new net.BlockList();
for (const [range, bits] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
  ["0.0.0.0", 8],
])
  PRIVATE.addSubnet(range, bits, "ipv4");
PRIVATE.addAddress("::1", "ipv6");
PRIVATE.addSubnet("fc00::", 7, "ipv6");
PRIVATE.addSubnet("fe80::", 10, "ipv6");

async function isInternal(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses = net.isIP(host) ? [host] : [];
  if (!addresses.length) {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return true; // unresolvable: nothing to load
    }
  }
  return addresses.some((a) =>
    PRIVATE.check(a, net.isIPv6(a) ? "ipv6" : "ipv4"),
  );
}

const browser = await chromium.launch({
  args: process.env.HOST_RULES
    ? [`--host-resolver-rules=${process.env.HOST_RULES}`]
    : [],
});
browser.on("disconnected", () => process.exit(1)); // the container restarts

async function capture({ url, width, theme, cookies = [] }) {
  const target = new URL(url);
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 800 },
    isMobile: mobile,
    hasTouch: mobile,
    // Final layout, not mid-animation: motion is CSS-only and motion-safe gated.
    reducedMotion: "reduce",
  });
  try {
    await ctx.addCookies(cookies.map((c) => ({ ...c, url: target.origin })));
    if (theme)
      // next-themes reads the visitor's choice from localStorage, under a key
      // that differs per look ("theme", "theme:<style>:<palette>").
      await ctx.addInitScript((wanted) => {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          return key === "theme" || String(key).startsWith("theme:")
            ? wanted
            : get.call(this, key);
        };
      }, theme);
    const verdicts = new Map();
    await ctx.route("**/*", async (route) => {
      const { protocol, hostname } = new URL(route.request().url());
      if (!protocol.startsWith("http")) return route.continue();
      if (hostname === target.hostname || ALLOW_HOSTS.has(hostname))
        return route.continue();
      if (!verdicts.has(hostname)) verdicts.set(hostname, isInternal(hostname));
      return (await verdicts.get(hostname)) ? route.abort() : route.continue();
    });

    const page = await ctx.newPage();
    const issues = [];
    const res = await page
      .goto(url, { waitUntil: "networkidle", timeout: 45_000 })
      .catch(() => null);
    const status = res?.status() ?? 0;
    if (!res || status >= 400) issues.push(`HTTP ${status || "no response"}`);
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
        await new Promise((r) => setTimeout(r, 120));
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
        { timeout: 15_000 },
      )
      .catch(() => {}); // still-loading images are reported as broken below
    const dom = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      broken: Array.from(document.images)
        .filter((i) => i.getClientRects().length > 0)
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.alt || i.currentSrc || i.src),
      empty: document.querySelectorAll("[data-empty-image]").length,
      theme:
        ["dark", "dim", "light"].find((t) =>
          document.documentElement.classList.contains(t),
        ) ?? "light",
      height: document.documentElement.scrollHeight,
    }));
    if (dom.overflow > 0) issues.push(`horizontal overflow: ${dom.overflow}px`);
    for (const what of dom.broken)
      issues.push(`broken image: ${what.slice(0, 120)}`);
    if (dom.empty) issues.push(`${dom.empty} empty image slot(s) rendered`);
    const strip = tileHeight(mobile);
    const height = Math.min(dom.height, strip * MAX_TILES);
    if (dom.height > height)
      issues.push(
        `page is ${dom.height}px tall: only the first ${height}px were captured`,
      );
    const tiles = [];
    for (let y = 0; y < height; y += strip) {
      const shot = await page.screenshot({
        fullPage: true,
        clip: { x: 0, y, width, height: Math.min(strip, height - y) },
        type: "jpeg",
        quality: 80,
      });
      tiles.push(shot.toString("base64"));
    }
    return { status, theme: dom.theme, height, issues, tiles };
  } finally {
    await ctx.close();
  }
}

http
  .createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health")
      return send(200, { ok: true });
    if (req.method !== "POST" || req.url !== "/capture")
      return send(404, { detail: "not found" });
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (typeof body.url !== "string" || !Number.isInteger(body.width))
        return send(400, { detail: "url and width are required" });
      send(200, await capture(body));
    } catch (err) {
      send(500, { detail: String(err).slice(0, 300) });
    }
  })
  .listen(PORT, "0.0.0.0", () => console.log(`browser: listening on ${PORT}`));
