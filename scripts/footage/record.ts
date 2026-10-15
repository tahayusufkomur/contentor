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
import { chromium, expect, test, type Browser, type Locator, type Page } from "../../e2e/node_modules/@playwright/test";
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
/** What the footage shows where the dev host would be (every scratch tenant is Mara Lindqvist). */
const SHOWN_HOST = "maralindqvist.contentor.app";

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
  // Next's dev badge stays out of the footage, and so does the dev hostname:
  // the setup flow's preview chrome prints the tenant's host, which here is
  // <scratch-slug>.localhost. Shown as the footage coach's real-looking domain.
  // ponytail: starts at load so hydration still sees the server's text; a host
  // on screen before load stays in those first frames (check them).
  await ctx.addInitScript((shown: string) => {
    addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
    const fix = (n: Node) => {
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = w.currentNode as Node | null; t; t = w.nextNode())
        if (t.nodeValue?.includes(".localhost")) t.nodeValue = t.nodeValue.replace(/[\w-]+\.localhost/g, shown);
    };
    addEventListener("load", () => {
      fix(document.body);
      new MutationObserver((ms) => ms.forEach((m) => fix(m.target))).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
  }, SHOWN_HOST);
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

// ── "Describe it" (Phase 2 chapter 5): the line, the card, Apply, Undo ─────

test("assistant", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  const s = await open(browser, "desktop", { slug: "demo-yoga", role: "coach" });
  const { page } = s;
  await page.goto(url("demo-yoga", "/admin/courses"));
  const line = page.getByTestId("describe-course");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("start");
  await line.click();
  await line.pressSequentially(
    "A four-week beginner course for desk workers: hips, spine and shoulders, twenty minutes a day",
    { delay: 28 },
  );
  await page.getByRole("button", { name: "Draft it" }).click();
  s.mark("drafting");
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await expect(apply, "no draft card: the assistant asked a question or the hub run failed. Re-run -g assistant").toBeVisible({
    timeout: 180_000,
  });
  s.mark("card");
  await page.waitForTimeout(2_500);
  await apply.click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 60_000 });
  s.mark("applied");
  await page.waitForTimeout(1_500);
  await undo.click();
  await expect(undo).toHaveCount(0, { timeout: 30_000 });
  s.mark("undone");
  await page.waitForTimeout(1_500);
  s.mark("end");
  await s.save("assistant");
});

// ── The setup interview (Phase 2 chapter 2): answering, the looks, the build ─

/** Every milestone the interview can fire: listed as fired, none starts. */
const FIRED_ALL = [
  "style:auto",
  "page:home",
  "rank:logos",
  "page:about",
  "page:contact",
  "page:faq",
  "page:events",
  "plan:membership",
  "draft:course",
  "draft:event",
  "draft:onsite",
  "draft:post",
];

/** The coach the setup takes film (the site-eval yoga brief, in interview answers). */
const COACH = {
  niche: "yoga",
  teaches: "Yoga for people who sit at a desk all day",
  photos: "stock",
  audience: "Office workers in their 30s to 50s who feel stiff and out of place in gym classes",
  outcome: "A looser back and hips in twenty minutes a day, without a studio",
  offers: ["course", "live", "community"],
  pitch: "Slow, kind yoga that undoes a day at the desk",
  difference: "Every class is built around the hips, spine and shoulders, with options for tight bodies",
};

const PARK_PY = `
import json
from django.conf import settings
from django.core.cache import cache
from django_tenants.utils import tenant_context
from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.core.tasks import _create_default_config
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.models import TenantConfig

A = json.loads(ARGS)
slug, schema = A["slug"], A["slug"].replace("-", "_")
for old in Tenant.objects.filter(slug=slug):
    old.delete(force_drop=True)
t = Tenant.objects.create(
    name="Mara Lindqvist", slug=slug, subdomain=slug, schema_name=schema,
    owner_email=f"{slug}@example.com", provisioning_status="ready", is_published=False,
)
Domain.objects.create(domain=f"{slug}.{settings.CONTENTOR_DOMAIN}", tenant=t, is_primary=True)
t.create_schema(check_if_exists=True, verbosity=0)
ids = [f.id for f in brief.FIELDS]
stop = ids.index(A["upto"]) if A["upto"] else len(ids)
answers = dict(A["answers"])
answers["delegated"] = [i for i in ids[:stop] if i not in answers]
t.wizard_state = {"flow": "interview", "answers": answers}
t.template_niche = "yoga"
t.save(update_fields=["wizard_state", "template_niche"])
with tenant_context(t):
    _create_default_config(t, "en")
    User.objects.create_user(email=t.owner_email, name="Mara Lindqvist", role="owner", is_staff=True)
    c = TenantConfig.objects.first()
    c.brand_name = "Mara Lindqvist Yoga"
    if A.get("style"):
        c.style = A["style"]
    c.setup_flow = {"status": "active", "interview": {"turns": [], "fired": A["fired"]}, "draft_status": {}, "page_builds": {}}
    c.save()
cache.delete(f"tenant:{schema}:config")
print("parked", slug, "at", A["upto"] or "go-live")
`;

/** A scratch tenant parked at question \`upto\` (null: every question answered
 * or delegated, so /setup opens on go-live). */
function park(slug: string, o: { upto: string | null; answers: Record<string, unknown>; fired: string[]; style?: string }) {
  const args = JSON.stringify({ slug, ...o });
  manage(["shell", "-c", `ARGS = ${JSON.stringify(args)}\n${PARK_PY}`]);
}

test.afterAll(() => {
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant\nfor t in Tenant.objects.filter(slug__startswith='footage-'):\n    t.delete(force_drop=True)",
  ]);
});

const BUSY = /Thinking…|Still thinking|Making that change|Finishing your pages|Confirming your plan/;
/** Wait out the guide's turn (a turn past 12 s reads "Still thinking…"). */
async function settleGuide(guide: Locator) {
  const busy = guide.getByText(BUSY);
  await busy.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
  await expect(busy, "the guide's turn never finished: a hub run queued or cancelled?").toHaveCount(0, { timeout: 120_000 });
}

test("setup-answer", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  park("footage-answer", { upto: "teaches", answers: {}, fired: [] });
  const s = await open(browser, "desktop", { slug: "footage-answer", role: "coach" });
  const { page } = s;
  await page.goto(url("footage-answer", "/setup"));
  await expect(page.getByText(/do you teach\?/)).toBeVisible({ timeout: 60_000 });
  await settle(page);
  s.mark("ask-1");
  const answer = page.getByLabel("Your answer");
  await answer.click();
  await answer.pressSequentially(COACH.teaches, { delay: 35 });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  s.mark("sent");
  const guide = page.getByRole("region", { name: "Your setup guide" });
  await settleGuide(guide);
  const tiles = guide.locator("h1 ~ div.grid > button");
  const stock = guide.getByRole("button", { name: "Choose photos for me", exact: true });
  await expect(tiles.first().or(stock)).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("ask-2");
  if (await stock.isVisible()) {
    await page.waitForTimeout(1_200);
    await stock.click();
  } else {
    for (let i = 0; i < Math.min(3, await tiles.count()); i++) {
      await tiles.nth(i).hover();
      await page.waitForTimeout(350);
    }
    await tiles.first().click();
    const cont = guide.getByRole("button", { name: /^Continue/ });
    if (await cont.isVisible()) await cont.click();
  }
  s.mark("picked");
  await settleGuide(guide);
  await page.waitForTimeout(1_000);
  s.mark("ask-3");
  await s.save("setup-answer");
});

test("setup-looks", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  park("footage-looks", { upto: "site_style", answers: COACH, fired: FIRED_ALL });
  const s = await open(browser, "desktop", { slug: "footage-looks", role: "coach" });
  const { page } = s;
  await page.goto(url("footage-looks", "/setup"));
  const guide = page.getByRole("region", { name: "Your setup guide" });
  const looks = guide.locator("div.grid > div > button");
  await expect(looks.first(), "the look cards never came").toBeVisible({ timeout: 90_000 });
  await settle(page);
  s.mark("gallery");
  for (let i = 0; i < Math.min(4, await looks.count()); i++) {
    await looks.nth(i).hover();
    await page.waitForTimeout(350);
  }
  await looks.nth(1).click();
  await expect(page.getByRole("dialog", { name: /, as a page$/ })).toBeVisible({ timeout: 30_000 });
  s.mark("gallery-picked");
  await settle(page);
  s.mark("opened");
  await glide(page, 600, 2_000);
  await page.getByRole("button", { name: "Keep this look" }).click();
  s.mark("kept");
  await page.waitForTimeout(800);
  await s.save("setup-looks");
});

test("setup-compose", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  await hubFree();
  park("footage-compose", { upto: null, answers: COACH, fired: FIRED_ALL, style: "journal" });
  const s = await open(browser, "desktop", { slug: "footage-compose", role: "coach" });
  const { page, ctx } = s;
  // Start the home build first: /setup polls only while something builds.
  const build = await ctx.request.post(url("footage-compose", "/api/v1/admin/setup-flow/build-page/"), {
    data: { page: "home", force: true },
  });
  expect(build.status(), await build.text()).toBe(202);
  await page.goto(url("footage-compose", "/setup"));
  await expect(page.getByText(/^Building your/).first()).toBeVisible({ timeout: 60_000 });
  await settle(page);
  s.mark("composing");
  await page.waitForTimeout(3_000);
  s.mark("composing-held");
  // Review Focus 2: a cancelled or failed hub run stops the take; it is never
  // filmed as a finished site.
  let status = "";
  await expect
    .poll(
      async () => {
        const r = await ctx.request.get(url("footage-compose", "/api/v1/admin/setup-flow/"));
        status = (await r.json()).page_builds?.home?.status ?? "";
        return status;
      },
      { timeout: 8 * 60_000, intervals: [5_000] },
    )
    .not.toMatch(/^(building|idle|)$/);
  expect(status, "the home build failed: a hub run cancelled? Check GET :39300/runs, then re-run -g setup-compose").toBe("ready");
  await expect(page.getByText(/^Building your/)).toHaveCount(0, { timeout: 30_000 });
  await settle(page);
  s.mark("built");
  await glide(page, 700, 2_500);
  s.mark("scrolled");
  await s.save("setup-compose");
});

// ── The site in twelve looks (Phase 2 chapters 1 and 3) ───────────────────

type Brief = { id: string; brand: string; niche: string; description: string; followups?: { q: string; a: string }[]; goals?: string[] };

const EXTRA_BRIEFS: Brief[] = [
  {
    id: "martial-arts",
    brand: "Kenji Mori Karate",
    niche: "martial_arts",
    description:
      "I teach traditional karate to adults who never trained before. Classes build stance, balance and confidence step by step, with plenty of pad work and no sparring until you are ready.",
    followups: [{ q: "Who is your ideal student?", a: "Adults from 25 to 50, men and women, who want discipline and fitness without a fight-club feel." }],
    goals: ["sell_courses", "run_live_classes", "build_community"],
  },
  {
    id: "beauty",
    brand: "Elif Aydın Makeup",
    niche: "beauty",
    description:
      "I teach everyday makeup to women who feel lost in the beauty aisle: one fresh ten-minute face first, then evening and event looks, with the products they already own.",
    followups: [{ q: "Who is your ideal student?", a: "Women from 25 to 45 who want to look polished for work and events without a full kit." }],
    goals: ["sell_courses", "run_live_classes", "sell_downloads"],
  },
  {
    id: "family",
    brand: "Kind Mornings",
    niche: "family",
    description:
      "I help parents of toddlers turn mornings and bedtimes into calm routines: short video lessons, printable routine charts and a weekly live question hour.",
    followups: [{ q: "Who is your ideal student?", a: "Tired parents of one- to four-year-olds who want fewer battles at the door and at bedtime." }],
    goals: ["sell_courses", "run_live_classes", "sell_downloads"],
  },
  {
    id: "outdoors",
    brand: "Ridge & Pine Guiding",
    niche: "outdoors",
    description:
      "I prepare beginners for their first multi-day hikes: route planning, packing light, map reading and safe pacing, then guided weekend trips in the Alps.",
    followups: [{ q: "Who is your ideal student?", a: "City people in their 30s and 40s who walk a lot but have never slept on a mountain." }],
    goals: ["sell_courses", "run_live_classes", "build_community"],
  },
];
const BRIEFS: Brief[] = [
  ...JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../e2e/fixtures/site-eval-briefs.json"), "utf8")),
  ...EXTRA_BRIEFS,
];
/** Phase 2's twelve look cards, each composed for the brief of its niche. */
const LOOK_BRIEFS: Record<string, string> = {
  journal: "yoga",
  kinetic: "fitness",
  encore: "music",
  studiofloor: "dance",
  tavola: "cooking",
  primer: "language-tutoring",
  dojo: "martial-arts",
  workshop: "painting",
  atelier: "beauty",
  sprout: "family",
  trail: "outdoors",
  nocturne: "wellness",
};
/** The hero's four-looks cut (encode.sh HERO_LOOKS, same order). */
const HERO_LOOKS = ["journal", "tavola", "encore", "kinetic"];

/** Scroll the page through so lazy images load, back to the top, then settle. */
async function preload(page: Page) {
  await settle(page);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0);
  });
  await settle(page);
}

for (const [look, briefId] of Object.entries(LOOK_BRIEFS)) {
  test(`looks:${look}`, async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    await hubFree();
    const brief = BRIEFS.find((b) => b.id === briefId)!;
    const out = manage(["eval_compose_site", "--style", look, "--brief", JSON.stringify(brief)]);
    const composed = JSON.parse(out.split("\n").pop()!) as { host: string; plan_source: string; pages: { key: string; status: string }[] };
    // Review Focus 2: a fallen-back plan or a failed build is not filmed.
    expect(composed.plan_source, `${look}: the site plan fell back to the recipe; re-run -g looks:${look}`).toBe("ai");
    expect(composed.pages.find((p) => p.key === "home")?.status, `${look}: home did not build`).toBe("ready");
    const site = `http://${composed.host}/`;

    // The look card's phone render.
    const still = await open(browser, "phone", { video: false });
    await still.page.goto(site);
    await preload(still.page);
    await still.page.screenshot({ path: path.join(RAW, `look-${look}.png`) });
    await still.save(`look-${look}`);
    if (!HERO_LOOKS.includes(look)) return;

    // The hero's cuts: about six seconds of the home page on a desktop and on a phone.
    for (const [profile, name, dy] of [
      ["desktop", `site-${look}`, 900],
      ["phone", `site-${look}-phone`, 520],
    ] as const) {
      const s = await open(browser, profile);
      await s.page.goto(site);
      await preload(s.page);
      s.mark("ready");
      await s.page.waitForTimeout(800);
      s.mark("scroll");
      await glide(s.page, dy, 4_000);
      await s.page.waitForTimeout(800);
      s.mark("end");
      await s.save(name);
    }
  });
}

// ── Mara's school: the success-led landing (2026-10-15) ────────────────────
// Every flow below films one lived-in coach, Mara Lindqvist on maralindqvist
// (seed it: `python manage.py seed_footage_coach`). mara-keep also needs
// LiveCraft (`make dev` in ../livecraft) and the webcam loops in RAW/cams:
// <student>.mjpeg from the students' Pix4Less headshots and mara-host.mjpeg
// from one of her site photos, each looped by ffmpeg with a slow drift.

const MARA = "maralindqvist";
const LIVECRAFT = "http://localhost:7800";

/** POST to LiveCraft's client API with its dev key. */
async function livecraft(p: string, data: object) {
  const res = await fetch(LIVECRAFT + p, {
    method: "POST",
    headers: { "x-api-key": "dev-key", "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(res.ok, `${p}: ${res.status} ${await res.clone().text()}`).toBe(true);
  return res.json();
}

const joinUrl = async (room: string, name: string, role: "host" | "participant") =>
  (await livecraft(`/api/v1/rooms/${room}/join`, { identity: name.toLowerCase().replace(/[^a-z]+/g, "-"), name, role }))
    .join_url as string;

/** A browser whose camera is a looping webcam clip from RAW/cams. */
const withCam = (cam: string) =>
  chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${path.join(RAW, "cams", `${cam}.mjpeg`)}`,
    ],
  });

/** Students join with their camera off; turn it on. */
const startVideo = (page: Page) => page.getByTitle("Start Video").click({ timeout: 20_000 }).catch(() => {});

/** Thursday's class: Mara and five students, every camera on. */
const CLASS: [string, "host" | "participant", string][] = [
  ["Mara Lindqvist", "host", "mara-host"],
  ["Lena Fischer", "participant", "lena-fischer"],
  ["Tomás Reyes", "participant", "tomas-reyes"],
  ["Hannah Okafor", "participant", "hannah-okafor"],
  ["Daniel Weber", "participant", "daniel-weber"],
  ["Aiko Sato", "participant", "aiko-sato"],
];

test("mara-keep", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  expect((await fetch(LIVECRAFT).catch(() => null))?.ok, "LiveCraft down: make dev in ../livecraft").toBe(true);
  // Her site: a class live now, so Priya's list shows it with Join.
  const coach = await open(browser, "tile", { slug: MARA, role: "coach", video: false });
  const created = await coach.ctx.request.post(url(MARA, "/api/v1/live/"), {
    data: {
      title: "Thursday slow flow",
      description: "Forty-five minutes for hips, spine and shoulders.",
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const cls = await created.json();
  expect((await coach.ctx.request.post(url(MARA, `/api/v1/live/${cls.id}/start/`))).ok()).toBeTruthy();
  // The room: LiveCraft, everyone seated before Priya arrives.
  const room = `mara-${Date.now().toString(36)}`;
  await livecraft("/api/v1/rooms", { room, title: "Thursday slow flow", layout: "meeting" });
  const seated: Browser[] = [];
  try {
    for (const [name, role, cam] of CLASS) {
      const b = await withCam(cam);
      seated.push(b);
      const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await p.goto(await joinUrl(room, name, role));
      if (role === "participant") await startVideo(p);
    }
    const phone = await withCam("priya-raghavan");
    seated.push(phone);
    const s = await open(phone, "phone", { slug: MARA, role: "student" });
    const { page } = s;
    await page.goto(url(MARA, "/dashboard"));
    await settle(page);
    s.mark("dash");
    await page.waitForTimeout(1_200);
    await glide(page, 420, 1_600);
    s.mark("dash-end");
    await page.goto(url(MARA, "/live-classes"));
    const join = page.getByRole("link", { name: /Join/ }).first();
    await expect(join).toBeVisible({ timeout: 30_000 });
    await settle(page);
    s.mark("live");
    await page.waitForTimeout(1_000);
    await join.tap();
    s.mark("live-tap");
    // Contentor runs LiveCraft's fake in dev, so the tap opens nothing: take her into the room.
    await page.goto(await joinUrl(room, "Priya Raghavan", "participant"));
    await startVideo(page);
    await expect.poll(() => page.locator("video").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    await page.waitForTimeout(1_500);
    s.mark("room");
    await page.waitForTimeout(4_000);
    s.mark("end");
    await page.screenshot({ path: path.join(RAW, "chip-live-src.png") });
    await s.save("mara-keep");
  } finally {
    for (const b of seated) await b.close();
    await coach.ctx.request.post(url(MARA, `/api/v1/live/${cls.id}/stop/`));
    await coach.ctx.request.delete(url(MARA, `/api/v1/live/${cls.id}/`));
    await coach.ctx.close();
  }
});

test("mara-found", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  // An article on her site, as a visitor reads it.
  const v = await open(browser, "tile", { slug: MARA });
  await v.page.goto(url(MARA, "/blog/why-your-hips-feel-tight-after-a-day-at-the-desk"));
  await settle(v.page);
  v.mark("article");
  await v.page.waitForTimeout(1_000);
  await glide(v.page, 700, 3_000);
  v.mark("article-end");
  await v.save("mara-article");
  // Her studio: the articles, then the campaigns that carried them.
  const s = await open(browser, "tile", { slug: MARA, role: "coach" });
  await s.page.goto(url(MARA, "/admin/blog"));
  await settle(s.page);
  s.mark("blog");
  await sweep(s.page, 1_500);
  s.mark("blog-end");
  await s.page.goto(url(MARA, "/admin/messages"));
  await settle(s.page);
  s.mark("sent");
  await sweep(s.page, 1_500);
  s.mark("sent-end");
  await s.save("mara-found");
});

/** A student who has not bought A Kinder Back (reset each take); prints her login token. */
const BUYER_PY = `
from django_tenants.utils import tenant_context
from apps.accounts.models import User
from apps.accounts.tokens import create_jwt
from apps.billing.models import Payment
from apps.courses.models import Enrollment
from apps.core.models import Tenant
t = Tenant.objects.get(slug="${MARA}")
with tenant_context(t):
    u, _ = User.objects.get_or_create(email="elin.s@demo.test", defaults={"name": "Elin Strom", "role": "student"})
    Payment.objects.filter(student=u).delete()
    Enrollment.objects.filter(user=u).delete()
    print(create_jwt(u, t))
`;

/** What Stripe's webhook does on checkout.session.completed (no listener in dev). */
const COMPLETE_PY = `
from django_tenants.utils import tenant_context
from apps.billing.models import Payment
from apps.billing.views.payments import grant_access_for_payment
from apps.core.models import Tenant
with tenant_context(Tenant.objects.get(slug="${MARA}")):
    p = Payment.objects.filter(student__email="elin.s@demo.test", status="pending").order_by("-id").first()
    p.status, p.provider = "completed", "stripe"
    p.save(update_fields=["status", "provider"])
    grant_access_for_payment(p)
    print(p.pk)
`;

test("mara-paid", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const jwt = manage(["shell", "-c", BUYER_PY]).split("\n").pop()!;
  const s = await open(browser, "tile", { slug: MARA });
  await s.ctx.addCookies([
    { name: "contentor_access_token", value: jwt, domain: `${MARA}.localhost`, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  const { page } = s;
  await page.goto(url(MARA, "/courses/a-kinder-back"));
  await settle(page);
  s.mark("course");
  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: /Buy|Enroll|Get started|Purchase/i }).first().click();
  // Her checkout: the item and its price, then Stripe's page.
  const pay = page.getByRole("button", { name: /^Pay / });
  await expect(pay).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("checkout");
  await page.waitForTimeout(1_200);
  await pay.click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  s.mark("stripe");
  // The card option's button has no box of its own (the row around it is the target).
  await page.getByTestId("card-accordion-item-button").evaluate((b: HTMLElement) => b.click());
  await page.locator('input[name="cardNumber"]').waitFor({ timeout: 20_000 });
  // Stripe's own fields ignore synthetic typing: set them through the native setter.
  await page.evaluate(() => {
    const set = (name: string, value: string) => {
      const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!el) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set("cardNumber", "4242 4242 4242 4242");
    set("cardExpiry", "12 / 34");
    set("cardCvc", "123");
    set("billingName", "Elin Strom");
    set("billingPostalCode", "11345");
  });
  await page.waitForTimeout(1_500);
  s.mark("filled");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(new RegExp(`${MARA}\\.localhost`), { timeout: 90_000 });
  await page.waitForTimeout(1_200);
  manage(["shell", "-c", COMPLETE_PY]);
  await expect(page.getByText(/Confirming your payment/)).toHaveCount(0, { timeout: 30_000 });
  await settle(page);
  s.mark("paid");
  await page.waitForTimeout(2_000);
  s.mark("paid-end");
  await s.save("mara-buy");
  // Her side: the sales, then what reaches her bank.
  const c = await open(browser, "tile", { slug: MARA, role: "coach" });
  await c.page.goto(url(MARA, "/admin/store"));
  await settle(c.page);
  c.mark("store");
  await c.page.waitForTimeout(1_200);
  await c.page.getByRole("button", { name: "Payments", exact: true }).click();
  await settle(c.page);
  c.mark("sales");
  await c.page.screenshot({ path: path.join(RAW, "chip-sale-src.png") });
  await sweep(c.page, 1_500);
  c.mark("sales-end");
  await c.page.goto(url(MARA, "/admin/payouts"));
  await settle(c.page);
  c.mark("payouts");
  await c.page.waitForTimeout(2_000);
  c.mark("payouts-end");
  await c.save("mara-paid");
});

test("mara-assistant", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  const s = await open(browser, "tile", { slug: MARA, role: "coach" });
  const { page } = s;
  await page.goto(url(MARA, "/admin/courses"));
  const line = page.getByTestId("describe-course");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("start");
  await line.click();
  await line.pressSequentially("A four-week course for desk workers: hips, spine and shoulders, twenty minutes a day", {
    delay: 28,
  });
  await page.getByRole("button", { name: "Draft it" }).click();
  s.mark("drafting");
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await expect(apply, "no draft card: the assistant asked a question or the hub run failed").toBeVisible({ timeout: 180_000 });
  s.mark("card");
  await page.waitForTimeout(2_500);
  await apply.click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 60_000 });
  s.mark("applied");
  await page.waitForTimeout(2_000);
  s.mark("end");
  // Leave her catalog as it was (off camera: after the last mark).
  await undo.click();
  await expect(undo).toHaveCount(0, { timeout: 30_000 });
  await s.save("mara-assistant");
});

test("mara-site", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  const s = await open(browser, "desktop", { slug: MARA });
  await s.page.goto(url(MARA, "/"));
  await preload(s.page);
  s.mark("ready");
  await s.page.waitForTimeout(800);
  s.mark("scroll");
  await glide(s.page, 900, 4_000);
  await s.page.waitForTimeout(800);
  s.mark("end");
  await s.save("mara-site");
});

test("mara-chips", async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  // A student's post, cut from her community feed (2x still).
  const c = await open(browser, "tile", { slug: MARA, role: "coach", video: false });
  await c.page.goto(url(MARA, "/admin/community"));
  const post = c.page.getByTestId("post-card").filter({ hasText: /Day 10 of Desk Reset/ });
  await expect(post).toBeVisible({ timeout: 30_000 });
  await settle(c.page);
  await post.screenshot({ path: path.join(RAW, "chip-post.png") });
  await c.save("mara-chips");
});
