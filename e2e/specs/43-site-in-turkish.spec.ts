// e2e/specs/43-site-in-turkish.spec.ts
//
// A student whose browser is English, on a site whose language is Turkish, meets
// no English: the public pages, the sign-in page, the sign-in email and the
// student dashboard all follow the site. The browser's Accept-Language must never
// win (the context says en-US on purpose).
//
// How "no English" is checked: every English interface text (site, student,
// common and pwa messages) that the Turkish file writes differently must be
// absent from the page. Creators' own content is NOT interface text: demo-yoga's
// course, plan and event titles, block copy and navbar labels are English DATA
// written at setup, and the plan excludes what creators write from translation.
// That content is fetched once, through the public API the frontend reads, and
// only its creator-authored fields (titles, descriptions, labels, block copy; not
// enum fields like pricing_type or status, which render as interface words such
// as "Free" and "Live") are cut out of each page's text before matching: a
// multi-word piece wherever it occurs, a single word only as a whole line. So no
// interface word is ever dropped from the check; buttons, labels, empty states,
// toasts and dates stay covered. An English phrase that the Turkish files also
// write as a whole phrase (e.g. "Name") is no leak signal and is skipped.
//
// Run serially (workers: 1): beforeAll/afterAll bracket the language so other
// specs stay on English. The Turkish site is demo-yoga; the sign-in EMAIL is
// checked on a scratch tenant because demo tenants skip the email in dev (the
// link is returned directly). The email needs EMAIL_SINK_ENABLED=true.
//
// The last test is the whole story: a Turkish creator signs up at contentor.app/tr,
// answers the setup interview in Turkish (a real-AI run of many minutes, so it has no
// retry and a 20-minute budget), goes live, meets no English admin.json text on the
// studio home, settings and courses, and then a student with an English browser walks
// the new site as test 1 walks demo-yoga.

import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TENANT } from "../helpers/auth";
import { manage, REPO_ROOT, setSiteLanguage } from "../helpers/compose";
import { latestEmail } from "../helpers/email";
import { translated } from "../helpers/i18n";
import { authoredLeaves, englishLeaks, leafValues, leakCandidates } from "../helpers/leaks";
import { grantTrial, signupThroughVerify } from "../helpers/signup";
import enAdmin from "../../frontend-customer/messages/en/admin.json";
import trAdmin from "../../frontend-customer/messages/tr/admin.json";
import trAuth from "../../frontend-main/messages/tr/auth.json";

test.use({ locale: "en-US" });

const SHARED_MESSAGES = path.join(REPO_ROOT, "packages/shared/src/i18n/messages");
const CUSTOMER_MESSAGES = path.join(REPO_ROOT, "frontend-customer/messages");
const MESSAGE_FILES = [
  [SHARED_MESSAGES, "site.json"],
  [CUSTOMER_MESSAGES, "student.json"],
  [CUSTOMER_MESSAGES, "common.json"],
  [CUSTOMER_MESSAGES, "pwa.json"],
] as const;

// English month and weekday names (and short forms): dates the browser's locale
// would write. "May" and "Mar" are left out: short, and Turkish writes "Mar" too.
const ENGLISH_DATES = [
  "January", "February", "March", "April", "June", "July", "August", "September",
  "October", "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday", "Jan", "Feb", "Apr", "Jun", "Jul", "Aug", "Sep",
  "Oct", "Nov", "Dec", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

const stamp = Date.now();
const SCRATCH_SLUG = "e2e-tr";
const SCRATCH_HOST = `${SCRATCH_SLUG}.localhost`;
const SCRATCH_BRAND = "E2E Turkish";
const STUDENT_EMAIL = `e2e-tr-student-${stamp}@example.com`;
const MAIL_EMAIL = `e2e-tr-mail-${stamp}@example.com`;

let candidates: string[] = [];
let authored: string[] = [];
let courseSlug = "";

const json = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

async function api(pathname: string, host = "demo-yoga.localhost") {
  const res = await fetch(`http://localhost${pathname}`, { headers: { "X-Tenant-Domain": host } });
  if (!res.ok) throw new Error(`GET ${pathname}: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body.results ?? body);
}

/** A site's stored content (demo-yoga's by default): what the frontend renders from the creator's data. */
async function storedContent(host = "demo-yoga.localhost") {
  const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().split("T")[0];
  // The calendar's month grid shows past days, with their authored titles ("Open Mat Session"): start
  // a week before the first of the month, which covers the grid's leading days.
  const now = new Date();
  const gridStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1) - 7 * 864e5).toISOString().split("T")[0];
  const [config, courses, plans, events] = await Promise.all([
    api("/api/v1/admin/config/", host),
    api("/api/v1/courses/", host),
    api("/api/v1/billing/plans/", host),
    api(`/api/v1/calendar/?from=${gridStart}&to=${day(90)}`, host),
  ]);
  const detail = courses.length ? await api(`/api/v1/courses/${courses[0].slug}/`, host) : {};
  return { authored: authoredLeaves([config, courses, detail, plans, events]), courseSlug: courses[0]?.slug ?? "" };
}

function ensureScratchTenant() {
  manage([
    "shell",
    "-c",
    `
from apps.core.models import Tenant, Domain
from django_tenants.utils import schema_context
slug = "${SCRATCH_SLUG}"
t = Tenant.objects.filter(slug=slug).first()
if t is None:
    t = Tenant.objects.create(
        name="${SCRATCH_BRAND}",
        slug=slug,
        subdomain=slug,
        schema_name=slug.replace("-", "_"),
        owner_email="owner-${stamp}@example.com",
        provisioning_status="ready",
    )
Domain.objects.get_or_create(domain="${SCRATCH_HOST}", defaults={"tenant": t, "is_primary": True})
# Always: a first run that timed out leaves a row without its schema; this is a no-op when it exists.
t.create_schema(check_if_exists=True, verbosity=0)
with schema_context(slug.replace("-", "_")):
    from apps.tenant_config.models import TenantConfig
    TenantConfig.objects.get_or_create(pk=1, defaults={"brand_name": "${SCRATCH_BRAND}"})
import django_redis
r = django_redis.get_redis_connection('default')
for key in r.keys('*throttle_magic_link*'):
    r.delete(key)
`.trim(),
  ]);
}

test.beforeAll(async () => {
  test.setTimeout(240_000); // a first-time schema creation + several manage.py boots outrun the default 60 s
  setSiteLanguage("demo_yoga", "tr");
  ensureScratchTenant();
  setSiteLanguage(SCRATCH_SLUG.replace("-", "_"), "tr");

  const stored = await storedContent();
  courseSlug = stored.courseSlug;
  authored = stored.authored;
  const pairs = MESSAGE_FILES.map(([root, file]) => [json(path.join(root, "en", file)), json(path.join(root, "tr", file))]);
  // What the Turkish files write, all of it: an English value inside it is no leak signal.
  const turkish = pairs.flatMap(([, tr]) => leafValues(tr)).join("\n");
  const english = pairs.flatMap(([en, tr]) => leakCandidates(en, tr, turkish));
  candidates = [...new Set([...english, ...ENGLISH_DATES])];
});

// Restore English even when a test failed or timed out.
test.afterAll(() => {
  setSiteLanguage("demo_yoga", "en");
  setSiteLanguage(SCRATCH_SLUG.replace("-", "_"), "en");
});

/**
 * `rightPage`, when given, proves the page asked for is the page shown: the address did not redirect
 * (/admin* goes to /setup while setup is active; a student without a session goes to /login) and
 * `shown` (a page-specific text of the Turkish messages) is there. Without it only the language and the
 * leaks are checked, and a Turkish plan picker or setup screen would pass for the studio.
 */
async function expectTurkish(
  page: Page,
  pathname: string,
  base = TENANT,
  words = candidates,
  own = authored,
  rightPage?: { shown?: (page: Page) => Locator },
) {
  await page.goto(`${base}${pathname}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "tr", { timeout: 20_000 });
  if (rightPage) {
    await expect(page, `${pathname} redirected`).toHaveURL(`${base}${pathname}`, { timeout: 20_000 });
    if (rightPage.shown) await expect(rightPage.shown(page).first(), `${pathname} is not the page`).toBeVisible({ timeout: 30_000 });
  }
  // Bounded: a page with a payment iframe never goes idle, and an unbounded wait ate the whole test timeout.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(500); // client-rendered pages: skeleton to content
  const leaks = await englishLeaks(page, words, own);
  expect(leaks, `English on ${pathname}`).toEqual([]);
}

test("a student with an English browser meets no English on a Turkish site", async ({ page }) => {
  test.setTimeout(240_000);
  expect(candidates.length, "no English candidates: message files missing?").toBeGreaterThan(50);
  expect(courseSlug, "demo-yoga needs a published course").not.toBe("");

  // ── 1. Public pages and the sign-in page ─────────────────────────────────
  for (const pathname of ["/", "/courses", `/courses/${courseSlug}`, "/plans", "/events", "/calendar", "/login"]) {
    await expectTurkish(page, pathname);
  }

  // ── 2. Sign in (demo tenants return the link instead of emailing it) ─────
  await page.goto(`${TENANT}/login`);
  await page.locator("#email").fill(STUDENT_EMAIL);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(`${TENANT}/`, { timeout: 30_000 });

  // ── 3. The student dashboard ─────────────────────────────────────────────
  await expectTurkish(page, "/dashboard");
});

test("the sign-in email is in the site's language, whatever the browser says", async () => {
  const res = await fetch(`http://localhost/api/v1/auth/magic-link/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Domain": SCRATCH_HOST, "Accept-Language": "en-US,en;q=0.9" },
    body: JSON.stringify({ email: MAIL_EMAIL }),
  });
  expect(res.ok, `magic-link request: ${res.status}`).toBeTruthy();
  const mail = await latestEmail(MAIL_EMAIL);

  // The English subject comes from the backend msgid, not from a guess here.
  const source = fs.readFileSync(path.join(REPO_ROOT, "backend/apps/notifications/transactional.py"), "utf8");
  const msgid = source.match(/def sign_in[\s\S]*?subject=_\("([^"]*)%\(brand\)s"\)/)?.[1];
  expect(msgid, "sign-in subject msgid not found in transactional.py").toBeTruthy();

  expect(mail.html).toMatch(/<html[^>]*\blang="tr"/);
  expect(mail.subject).not.toBe(`${msgid}${SCRATCH_BRAND}`);
  expect(mail.subject).not.toContain(msgid!.trim());
});

// ── A Turkish creator, from contentor.app/tr to a live site ────────────────────────────

const CREATOR_EMAIL = `e2e-tr-coach-${stamp}@contentor.test`;
const CREATOR_NAME = "Ayşe E2E";
// ASCII on purpose: the address the name makes is asserted below, and the slug rule is not under test here.
const BRAND = `E2E Yoga TR ${stamp}`;
const SITE_SLUG = `e2e-yoga-tr-${stamp}`;
const SITE_HOST = `${SITE_SLUG}.localhost`;
const SITE = `http://${SITE_HOST}`;
const NEW_STUDENT_EMAIL = `e2e-tr-new-student-${stamp}@example.com`;

// What she types, in Turkish. Her own words are no interface text: they are cut out of the leak check.
const BIO = "Masa başında çalışan insanlara çevrimiçi ve küçük gruplarla yoga öğretiyorum.";
const OFFER = "Gün boyu masa başında oturanlar için yoga";
const STORY = "Yıllarca masa başında çalıştıktan sonra yoganın sırt ağrımı hafiflettiğini fark ettim ve öğretmeye başladım.";
const TRAINING = "2019'da 200 saatlik bir yoga öğretmenliği eğitimini tamamladım.";
const ANYTHING = "Sence en uygun olan hangisiyse o";
const PLACE = "E2E Stüdyo";
const ADDRESS = "Atatürk Cad. 1, 34000 İstanbul";
const HANDLE = "e2estudyo";

// A leak is an English admin.json value; these are English by nature, or hers, and are cut out of the page text.
const STUDIO_ALLOWED = [
  BRAND, // her site's name, typed by her
  CREATOR_NAME, // her own name, typed by her
  SITE_HOST, // the example address under her brand
  BIO, OFFER, STORY, TRAINING, ANYTHING, PLACE, ADDRESS, // answers she typed
];

// "Sat" and "Sun" are Turkish words too ("sat" = sell, "sun" = offer): on creator pages and in her copy they are no date.
const STUDIO_DATES = ENGLISH_DATES.filter((d) => d !== "Sat" && d !== "Sun");

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (...texts: string[]) => new RegExp(texts.map(escape).join("|"));

/** Stale runs of this test: tenants and their trial rows (raw SQL for the cross-schema PlatformSubscription FK). */
function sweepOldRuns() {
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-yoga-tr-') | Tenant.objects.filter(owner_email__startswith='e2e-tr-coach-', owner_email__endswith='@contentor.test'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
}

// A real-AI run of many minutes: a failure here is rarely flaky, and a retry doubles the wait. Fail once.
test.describe("creator", () => {
  test.describe.configure({ retries: 0 });

  test("a Turkish creator goes from contentor.app/tr to live", async ({ page, browser }) => {
    test.setTimeout(1_200_000);
    sweepOldRuns();

    // The words of the interview are the Turkish messages' own, so no English option text is read.
    const sf = trAdmin.setupFlow;
    const q = sf.question;

    // ── 1. Sign up at /tr/signup: the site's language starts as the page's ──────────
    const mail = await signupThroughVerify(page, CREATOR_EMAIL, {
      path: "/tr/signup",
      texts: trAuth.signup,
      name: CREATOR_NAME,
    });
    expect(mail.subject, "the verify email's subject").toBe(translated("Verify your email to create your site"));
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    // No site before the card: the verify page offers the trial first, in Turkish.
    await expect(page.getByRole("button", { name: trAuth.signup.verify.card.cta })).toBeVisible({ timeout: 20_000 });
    grantTrial(CREATOR_EMAIL, stamp, CREATOR_NAME);
    await page.reload();

    // ── 2. /setup, in her language, at the temporary address ───────────────────────
    await page.waitForURL(/new-site-[0-9a-f]+\.localhost\/setup/, { timeout: 120_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "tr", { timeout: 30_000 });
    const guideAtStart = page.getByRole("region", { name: sf.panel.aria });

    // Her bio, read once (it ticks the questions ahead), or skipped.
    const bio = guideAtStart.getByLabel(sf.bio.label);
    await expect(bio).toBeVisible({ timeout: 60_000 });
    await bio.fill(BIO);
    await guideAtStart.getByRole("button", { name: sf.opening.continue, exact: true }).click();
    const nameBox = guideAtStart.getByLabel(sf.opening.nameLabel);
    const unread = guideAtStart.getByRole("alert");
    await expect(nameBox.or(unread)).toBeVisible({ timeout: 60_000 });
    if (await unread.isVisible()) await guideAtStart.getByRole("button", { name: sf.opening.skip }).click();

    // Her site's name makes its address.
    await expect(nameBox).toBeVisible({ timeout: 30_000 });
    await nameBox.fill(BRAND);
    await expect(guideAtStart.getByText(SITE_HOST)).toBeVisible();
    await guideAtStart.getByRole("button", { name: sf.opening.continue, exact: true }).click();
    // The AI may offer a typo fix or alternatives first; Continue keeps the name.
    const answer = page.getByLabel(sf.answerBox.label, { exact: true });
    const keepName = guideAtStart.getByText(sf.opening.pickOrKeep);
    // The first question is "What do you offer?" (or "...I ticked what your bio says."): its Turkish is a
    // substring of both, read from the backend's own catalog.
    const offer = page.getByText(translated("What do you offer?")).first();
    await expect(keepName.or(offer)).toBeVisible({ timeout: 60_000 });
    if (await keepName.isVisible()) await guideAtStart.getByRole("button", { name: sf.opening.continue, exact: true }).click();
    await page.waitForURL(new RegExp(`${SITE_SLUG}\\.localhost/setup`), { timeout: 60_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");

    // ── 3. The interview, in Turkish ───────────────────────────────────────────────
    await expect(offer).toBeVisible({ timeout: 30_000 });
    await expect(answer).toBeVisible();
    await answer.fill(OFFER);
    const send = page.getByRole("button", { name: sf.answerBox.send, exact: true });
    await send.click();

    const guide = page.getByRole("region", { name: sf.panel.aria });
    // What the guide shows while a turn, an edit or a page build is in flight.
    const busy = guide.getByText(
      anyOf(q.thinking, q.stillThinking.split(".")[0], sf.panel.making, sf.goLive.finishing, sf.goLive.confirming),
    );
    const decide = guide.getByRole("button", { name: q.pickForMe, exact: true });
    // A tile is structural (the first of the options grid), whatever words it carries.
    const tile = guide.locator("h1 ~ div.grid > button").first();
    // "Continue", "Continue with your note" and "Continue with N" (the picks ticked). The real button: after a
    // pick, a sticky copy of it shows while it is scrolled out of view.
    const cont = guide
      .getByRole("button", {
        name: new RegExp(`^(${escape(q.continue)}|${escape(q.continueNote)}|${escape(q.continueCount).replace("\\{count\\}", "\\d+")})$`),
      })
      .and(guide.locator("#setup-continue"));
    // The social-accounts question wants a handle for each network ticked.
    const handles = guide.getByPlaceholder(new RegExp(`${escape(sf.socials.placeholder.replace("{site}", ""))}$`));
    // The time-zone question opens on the browser's own zone: Continue takes it.
    const zone = guide.getByLabel(q.timeZone);
    // The in-person class asks for its place and address: two boxes, no tiles.
    const place = guide.getByPlaceholder(q.placePlaceholder);
    // A drafted course or class to approve, or the line saying its draft failed.
    const looksGood = guide.getByRole("button", { name: q.looksGood, exact: true });
    const draftFailed = guide.getByText(/taslağını oluşturamadım/);
    const goLive = guide.getByRole("button", { name: sf.goLive.goLive, exact: true });
    // Before going live each built page is looked over and approved, one by one.
    const pageOk = guide.getByRole("button", { name: sf.panel.approve });
    // A trial cannot sell; the spec goes live now and sells later.
    const sellLater = guide.getByRole("button", { name: sf.goLive.sellLater });
    // The photos question: the guide chooses (her own upload is test 1's business).
    const stockPhotos = guide.getByRole("button", { name: sf.photos.stockAnswer, exact: true });
    // A look tapped opens as a page; "Keep this look" answers the question.
    const keepLook = page.getByRole("button", { name: sf.look.keep });
    // Story and training are real answers, not "you decide" words. The question's identity comes from
    // the interview itself (its field), never from its wording.
    const ownWords = async () => {
      const res = await page.request.get(`${new URL(page.url()).origin}/api/v1/admin/setup-flow/`);
      expect(res.ok(), `the setup-flow state call failed (${res.status()}): the question's field is unknown`).toBeTruthy();
      const field: string | null = (await res.json())?.interview?.guide?.field ?? null;
      if (field === "story") return STORY;
      if (field === "credentials") return TRAINING;
      return ANYTHING;
    };
    const action = decide
      .or(looksGood)
      .or(pageOk)
      .or(goLive)
      .or(sellLater)
      .or(tile)
      .or(zone)
      .or(place)
      .or(stockPhotos);
    for (let i = 0; i < 70; i++) {
      // Wait for the work in flight to finish, then for the next screen's controls.
      await busy.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
      await expect(busy).toHaveCount(0, { timeout: 300_000 });
      await action.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      await keepLook.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
      if (await keepLook.isVisible()) await keepLook.click();
      if (await pageOk.isVisible()) {
        await expect(pageOk).toBeEnabled({ timeout: 300_000 });
        await pageOk.click();
        continue;
      }
      if (await goLive.isVisible()) break;
      if (await sellLater.isVisible()) {
        await sellLater.click();
        await expect(goLive).toBeVisible({ timeout: 600_000 });
        break;
      }
      if (await looksGood.isVisible()) {
        // Enabled once the draft is ready; a failed draft says so at once.
        await expect(looksGood.and(guide.locator("button:enabled")).or(draftFailed)).toBeVisible({ timeout: 300_000 });
        await expect(draftFailed, "the draft failed: see `docker compose logs celery-worker`").toHaveCount(0);
        await looksGood.click();
        continue;
      }
      if (await stockPhotos.isVisible()) {
        await stockPhotos.click();
        continue;
      }
      if (await decide.isVisible()) {
        await decide.click();
        continue;
      }
      if (await zone.isVisible()) {
        await cont.click();
        continue;
      }
      if (await place.isVisible()) {
        await place.fill(PLACE);
        await guide.getByPlaceholder(q.addressPlaceholder).fill(ADDRESS);
        await cont.click();
        continue;
      }
      if (await tile.isVisible()) {
        // A question the bio already ticked keeps its picks (a tap would untick one): Continue takes them.
        if (!(await guide.locator('h1 ~ div.grid > button[aria-pressed="true"]').count())) await tile.click();
        for (const handle of await handles.all()) await handle.fill(HANDLE);
        // A starter tile opened as a card: finish its sentence there, in her words.
        const finish = guide.getByLabel(new RegExp(`^${escape(sf.starter.finishLabel.split(":")[0])}`));
        if (await finish.count()) await finish.first().fill(await ownWords());
        await cont.click();
        continue;
      }
      await answer.fill(await ownWords());
      await send.click();
    }

    // ── 4. Go live ─────────────────────────────────────────────────────────────────
    await expect(goLive).toBeVisible({ timeout: 600_000 });
    await goLive.click();
    await expect(page.getByRole("button", { name: sf.launch.toAdmin })).toBeVisible({ timeout: 60_000 });
    // The hand-off card says what the assistant did, in her language (the backend's own words).
    await expect(page.getByText(translated("Ran your setup."))).toBeVisible();

    // ── 5. The studio: no English admin.json text on the home, settings and courses ──
    const stored = await storedContent(SITE_HOST);
    const trTexts = [
      leafValues(trAdmin),
      leafValues(json(path.join(CUSTOMER_MESSAGES, "tr", "common.json"))),
      leafValues(json(path.join(SHARED_MESSAGES, "tr", "studio.json"))),
    ]
      .flat()
      .join("\n");
    const studioWords = [...new Set([...leakCandidates(enAdmin, trAdmin, trTexts), ...STUDIO_DATES])];
    expect(studioWords.length, "no English admin candidates: message files missing?").toBeGreaterThan(500);
    // The studio's course list also holds drafts: with her session the same endpoint returns them, and the
    // titles the AI wrote are hers (the public read above has only the published ones).
    const adminCourses = await page.request.get(`${SITE}/api/v1/courses/?limit=100`);
    expect(adminCourses.ok(), `the studio's course list failed (${adminCourses.status()})`).toBeTruthy();
    const courseTexts = authoredLeaves(await adminCourses.json());
    const studioOwn = [...stored.authored, ...courseTexts, ...STUDIO_ALLOWED];
    const studioPages: [string, (page: Page) => Locator][] = [
      ["/admin", (p) => p.getByText(trAdmin.welcome.overview)], // the greeting of a live site (setup is over)
      ["/admin/settings", (p) => p.getByRole("heading", { level: 1, name: trAdmin.nav.items.settings, exact: true })],
      ["/admin/courses", (p) => p.getByRole("heading", { level: 1, name: trAdmin.nav.items.courses, exact: true })],
    ];
    for (const [pathname, shown] of studioPages) {
      await expectTurkish(page, pathname, SITE, studioWords, studioOwn, { shown });
    }

    // ── 6. Test 1's student path, on this site: a student with an English browser ──
    const studentContext = await browser.newContext({ locale: "en-US" });
    try {
      const student = await studentContext.newPage();
      const publicPaths = ["/", "/courses", "/plans", "/events", "/calendar", "/login"];
      if (stored.courseSlug) publicPaths.splice(2, 0, `/courses/${stored.courseSlug}`);
      const siteOwn = [...stored.authored, ...courseTexts, ...STUDIO_ALLOWED];
      // Her Turkish copy may hold "sat" or "sun" as words: no date there either.
      const siteWords = candidates.filter((w) => w !== "Sat" && w !== "Sun");
      for (const pathname of publicPaths) await expectTurkish(student, pathname, SITE, siteWords, siteOwn, {});

      // A real tenant emails the sign-in link (demo tenants return it instead).
      await student.goto(`${SITE}/login`);
      await student.locator("#email").fill(NEW_STUDENT_EMAIL);
      await student.locator("form button[type=submit]").click();
      const link = (await latestEmail(NEW_STUDENT_EMAIL)).html.match(/href="([^"]*\/callback\?token=[^"]*)"/)?.[1];
      expect(link, "no /callback link in the sign-in email").toBeTruthy();
      await student.goto(link!.replace(/&amp;/g, "&"));
      await student.waitForURL((url) => !url.pathname.startsWith("/callback"), { timeout: 30_000 });
      // The address must hold (a new student with no access could be sent elsewhere) before the leak check.
      await expectTurkish(student, "/dashboard", SITE, siteWords, siteOwn, {});
    } finally {
      await studentContext.close();
    }
  });
});
