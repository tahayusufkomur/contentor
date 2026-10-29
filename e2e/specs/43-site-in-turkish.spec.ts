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

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TENANT } from "../helpers/auth";
import { manage, REPO_ROOT, setSiteLanguage } from "../helpers/compose";
import { latestEmail } from "../helpers/email";
import { authoredLeaves, englishLeaks, leafValues, leakCandidates } from "../helpers/leaks";

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

async function api(pathname: string) {
  const res = await fetch(`http://localhost${pathname}`, { headers: { "X-Tenant-Domain": "demo-yoga.localhost" } });
  if (!res.ok) throw new Error(`GET ${pathname}: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body.results ?? body);
}

/** demo-yoga's stored content: what the frontend renders from the creator's data. */
async function storedContent() {
  const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().split("T")[0];
  const [config, courses, plans, events] = await Promise.all([
    api("/api/v1/admin/config/"),
    api("/api/v1/courses/"),
    api("/api/v1/billing/plans/"),
    api(`/api/v1/calendar/?from=${day(0)}&to=${day(90)}`),
  ]);
  const detail = courses.length ? await api(`/api/v1/courses/${courses[0].slug}/`) : {};
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

async function expectTurkish(page: Page, pathname: string) {
  await page.goto(`${TENANT}${pathname}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "tr", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500); // client-rendered pages: skeleton to content
  const leaks = await englishLeaks(page, candidates, authored);
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
