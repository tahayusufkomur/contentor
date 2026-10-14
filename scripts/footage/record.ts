// Product footage for the landing (docs/superpowers/specs/
// 2026-10-14-premium-marketing-and-studio-design.md §5.3), recorded from the
// running dev stack. One test per flow. Each writes, under the gitignored
// e2e/eval-shots/footage/: <flow>.webm, <flow>.marks.json (seconds from the
// video's first frame; encode.sh cuts on them) and the PNG stills it takes.
//   cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g <flow>
// A heavy job: nothing else heavy alongside it (root CLAUDE.md).
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
// The repo root has no node_modules, so @playwright/test does not resolve from
// here: import e2e's copy (the same file the runner and e2e/helpers load).
import { expect, test, type Browser, type Locator, type Page } from "../../e2e/node_modules/@playwright/test";
import { manage } from "../../e2e/helpers/compose";

const RAW = path.resolve(__dirname, "../../e2e/eval-shots/footage");
fs.mkdirSync(RAW, { recursive: true });

const PROFILES = {
  // Spec 5.3: 1600×1000 at device scale 2. The video is written at 1600×1000
  // from 2x frames, so text is supersampled, not soft.
  desktop: { viewport: { width: 1600, height: 1000 }, video: { width: 1600, height: 1000 }, phone: false },
  // Studio tiles: a smaller window so the UI still reads at tile size; 16:10 like the stills.
  tile: { viewport: { width: 1280, height: 800 }, video: { width: 1280, height: 800 }, phone: false },
  // A phone, filmed at its device pixels (Phase 2: 750×1624).
  phone: { viewport: { width: 375, height: 812 }, video: { width: 750, height: 1624 }, phone: true },
} as const;
type Profile = keyof typeof PROFILES;

const url = (slug: string, p: string) => `http://${slug}.localhost${p}`;

/** A context as `role` on `slug` (no role: a visitor). Records unless video is
 * false; a still-only context renders with reduced motion (final layout). */
async function open(
  browser: Browser,
  profile: Profile,
  o: { slug?: string; role?: "coach" | "student"; video?: boolean } = {},
) {
  const p = PROFILES[profile];
  const recording = o.video !== false;
  const ctx = await browser.newContext({
    viewport: p.viewport,
    deviceScaleFactor: 2,
    isMobile: p.phone,
    hasTouch: p.phone,
    colorScheme: "light",
    reducedMotion: recording ? "no-preference" : "reduce",
    recordVideo: recording ? { dir: path.join(RAW, ".tmp"), size: p.video } : undefined,
  });
  if (o.role && o.slug) {
    const jwt = manage(["issue_login_token", "--role", o.role, "--tenant", o.slug]).split("\n").pop()!;
    await ctx.addCookies([
      { name: "contentor_access_token", value: jwt, domain: `${o.slug}.localhost`, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    ]);
  }
  // Next's dev badge stays out of the footage.
  await ctx.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  const page = await ctx.newPage();
  const t0 = Date.now(); // the video starts with the page
  const marks: Record<string, number> = {};
  return {
    ctx,
    page,
    /** Seconds since the first frame, for encode.sh's cuts. */
    mark: (name: string) => {
      marks[name] = Math.round((Date.now() - t0) / 100) / 10;
    },
    /** Close; when recording, save <name>.webm and <name>.marks.json under RAW. */
    async save(name: string) {
      await ctx.close();
      if (!recording) return;
      const video = page.video()!;
      const dest = path.join(RAW, `${name}.webm`);
      if (p.phone) {
        const tmp = await video.path();
        execFileSync(
          "ffmpeg",
          ["-y", "-hide_banner", "-loglevel", "error", "-i", tmp, "-vf", "crop=375:812:0:0,scale=750:1624:flags=lanczos", "-an", "-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "4", dest],
        );
      } else {
        await video.saveAs(dest);
      }
      await video.delete();
      fs.writeFileSync(path.join(RAW, `${name}.marks.json`), JSON.stringify(marks, null, 2) + "\n");
    },
  };
}

/** Wait for the network, the fonts and every rendered image, then a beat. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page
    .waitForFunction(
      () => Array.from(document.images).every((i) => i.getClientRects().length === 0 || i.complete),
      null,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
}

/** Scroll whatever is under the pointer by dy px over ms, one wheel step per
 * video frame (25 fps). Wheel, not window.scrollTo: the studio scrolls <main>. */
async function glide(page: Page, dy: number, ms: number) {
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width * 0.6, vp.height * 0.5);
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(40);
  }
}

/** Move the pointer across the page in a slow arc, so hover states show. */
async function sweep(page: Page, ms: number) {
  const vp = page.viewportSize()!;
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(vp.width * (0.25 + 0.5 * k), vp.height * (0.35 + 0.2 * Math.sin(k * Math.PI)));
    await page.waitForTimeout(40);
  }
}

/** The agent hub (ssh tunnel on :39300) needs an account free for an
 * interactive run and an empty queue: compose-* types run interactive there,
 * so a busy hub queues or cancels them (Review Focus 2). */
async function hubFree() {
  const res = await fetch("http://localhost:39300/lanes/studio", { signal: AbortSignal.timeout(3_000) }).catch(() => null);
  if (!res?.ok) {
    console.warn("agent hub not reachable on :39300 (tunnel down?): skipping the free-account check");
    return;
  }
  const lane = (await res.json()) as Record<string, unknown>;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : Number(v ?? 0));
  expect(n(lane.idle), `no idle hub account: ${JSON.stringify(lane)}`).toBeGreaterThan(0);
  expect(n(lane.queued), `hub queue not empty: ${JSON.stringify(lane)}`).toBe(0);
}

test.beforeAll(async () => {
  // One heavy job on the Docker VM at a time (Review Focus 1): no e2e, test
  // suite, build or site eval may run while we record.
  const busy = execSync("ps -Ao command", { encoding: "utf8" })
    .split("\n")
    .filter((l) => /playwright test|vitest|next build|manage\.py test|pytest|make (test|e2e|eval-sites|deploy)/.test(l))
    .filter((l) => !l.includes("footage.config"));
  expect(busy, `another heavy job is running:\n${busy.join("\n")}`).toEqual([]);
  const health = await fetch("http://localhost/api/health/").catch(() => null);
  expect(health?.ok, "dev stack down: make dev-d").toBe(true);
});

// ── The student on a phone (Phase 2 chapter 6) ─────────────────────────────

test("student-phone", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  // A class live now, so the student's list shows it with Join (as in 04-live-class).
  const coach = await open(browser, "tile", { slug: "demo-yoga", role: "coach", video: false });
  const created = await coach.ctx.request.post(url("demo-yoga", "/api/v1/live/"), {
    data: {
      title: "Evening unwind, live",
      description: "Thirty minutes for a stiff back after work.",
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const cls = await created.json();
  const started = await coach.ctx.request.post(url("demo-yoga", `/api/v1/live/${cls.id}/start/`));
  expect(started.ok(), await started.text()).toBeTruthy();
  try {
    const s = await open(browser, "phone", { slug: "demo-yoga", role: "student" });
    const { page } = s;
    await page.goto(url("demo-yoga", "/dashboard"));
    await settle(page);
    s.mark("dash");
    await page.waitForTimeout(1_000);
    const cont = page.getByRole("link", { name: /Continue Learning/ }).first();
    if (await cont.count()) await cont.tap();
    else await page.goto(url("demo-yoga", "/learn/yoga-for-beginners"));
    s.mark("dash-tap");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await settle(page);
    s.mark("lesson");
    await glide(page, 500, 2_000);
    s.mark("lesson-end");
    await page.goto(url("demo-yoga", "/live-classes"));
    const join = page.getByRole("link", { name: /Join/ }).first();
    await expect(join).toBeVisible({ timeout: 30_000 });
    await settle(page);
    s.mark("live");
    await page.waitForTimeout(1_000);
    await join.tap();
    s.mark("live-tap");
    await page.waitForTimeout(1_500);
    s.mark("end");
    await s.save("student-phone");

    // Chapter 6's two tiles: the same two screens on a desktop, as stills.
    const d = await open(browser, "tile", { slug: "demo-yoga", role: "student", video: false });
    await d.page.goto(url("demo-yoga", "/dashboard"));
    await settle(d.page);
    await d.page.screenshot({ path: path.join(RAW, "tile-student-dashboard.png") });
    await d.page.goto(url("demo-yoga", "/live-classes"));
    await expect(d.page.getByRole("link", { name: /Join/ }).first()).toBeVisible({ timeout: 30_000 });
    await settle(d.page);
    await d.page.screenshot({ path: path.join(RAW, "tile-live-class.png") });
    await d.save("student-stills");
  } finally {
    // Leave demo-yoga as it was.
    await coach.ctx.request.post(url("demo-yoga", `/api/v1/live/${cls.id}/stop/`));
    await coach.ctx.request.delete(url("demo-yoga", `/api/v1/live/${cls.id}/`));
    await coach.ctx.close();
  }
});

// ── Studio tiles (Phase 2 chapter 4): a still and a ≤ 4 s loop each ────────

const TILE_ROUTES = [
  ["courses", "/admin/courses"],
  ["messages", "/admin/inbox"],
  ["community", "/admin/community"],
  ["media", "/admin/media"],
  ["blog", "/admin/blog"],
  ["logo", "/?edit=1&studio=1"],
] as const;

test("studio-tiles", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const s = await open(browser, "tile", { slug: "demo-yoga", role: "coach" });
  const { page } = s;
  for (const [key, route] of TILE_ROUTES) {
    await page.goto(url("demo-yoga", route));
    if (key === "logo") await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await page.screenshot({ path: path.join(RAW, `tile-${key}.png`) });
    s.mark(`${key}-start`);
    await sweep(page, 1_500);
    await glide(page, 320, 2_000);
    s.mark(`${key}-end`);
  }
  await s.save("studio-tiles");
});

const nextFriday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
};

test("studio-live", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const s = await open(browser, "tile", { slug: "demo-yoga", role: "coach" });
  const { page, ctx } = s;
  await page.goto(url("demo-yoga", "/admin/live"));
  const add = page.getByRole("button", { name: "New class or event" });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await page.screenshot({ path: path.join(RAW, "tile-live.png") });
  s.mark("form");
  await add.click();
  await page.locator("#event-kind").selectOption("live");
  await page.locator("#event-title").pressSequentially("Friday flow, live", { delay: 30 });
  await page.locator("#event-description").pressSequentially("Forty-five minutes for tight hips.", { delay: 20 });
  await page.locator("#event-when").fill(nextFriday());
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/api\/v1\/(live|live-streams|zoom|onsite)\/$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(201);
  await expect(page.getByText("Friday flow, live").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  s.mark("created");
  // Leave demo-yoga as it was (off camera: after the last mark).
  await ctx.request.delete(`${new URL(res.url()).origin}${new URL(res.url()).pathname}${(await res.json()).id}/`);
  await s.save("studio-live");
});

