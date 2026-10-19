// e2e/specs/40-access.spec.ts
//
// Access rights: the Access section on a course replaces the Pricing Type
// dropdown. The owner sets Sell it once (with a window) beside a subscription
// (with its own window), Free for everyone covers the other ways, the last way
// cannot be unticked, and a coach who is not the owner sees the subscriptions
// read-only. The steps run in order on one course, so the describe is serial.
//
// Every check of what was saved reads GET /api/v1/admin/access/course/<id>/ too.

import { test, expect, type BrowserContext } from "@playwright/test";
import {
  coachContext,
  staffContext,
  studentContext,
  TENANT,
} from "../helpers/auth";
import { manage } from "../helpers/compose";

const STAMP = Date.now();
const COURSE_TITLE = `E2E Access ${STAMP}`;
const PLAN_NAME = `E2E Gold ${STAMP}`;
const STAFF_EMAIL = "e2e-access-staff@example.com";
const ENDED_MARK = `e2e-access-ended-${STAMP}`;

const TENANT_SHELL =
  "from django_tenants.utils import tenant_context\n" +
  "from apps.core.models import Tenant\n" +
  "t = Tenant.objects.get(slug='demo-yoga')\n" +
  "with tenant_context(t):\n";

/** Runs `body` (indented python) inside the demo tenant; returns what it prints. */
function inTenant(body: string): string {
  return manage([
    "shell",
    "-c",
    TENANT_SHELL +
      body
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
  ]);
}

let owner: BrowserContext;
let courseId: number;
let courseSlug: string;
let planId: number;
let createdStaff = false;

async function ways() {
  const res = await owner.request.get(
    `${TENANT}/api/v1/admin/access/course/${courseId}/`,
  );
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  owner = await coachContext(browser);

  const course = await owner.request.post(`${TENANT}/api/v1/courses/`, {
    data: {
      title: COURSE_TITLE,
      description: "",
      pricing_type: "free",
      price: 0,
      is_published: true,
      modules: [
        {
          title: "Start",
          lessons: [{ title: "Welcome", content_html: "<p>Welcome.</p>" }],
        },
      ],
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(course.status(), await course.text()).toBe(201);
  const created = await course.json();
  courseId = created.id;
  courseSlug = created.slug;

  const plan = await owner.request.post(`${TENANT}/api/v1/billing/plans/`, {
    data: {
      name: PLAN_NAME,
      description: "",
      price: "15.00",
      billing_interval_months: 1,
      is_active: true,
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(plan.status(), await plan.text()).toBe(201);
  planId = (await plan.json()).id;

  // A coach who is not the owner, if the tenant has none yet.
  createdStaff =
    inTenant(
      "from apps.accounts.models import User\n" +
        "if User.objects.filter(role='coach').exists():\n" +
        "    print('had', end='')\n" +
        "else:\n" +
        `    User.objects.create_user(email='${STAFF_EMAIL}', name='E2E Staff', role='coach')\n` +
        "    print('created', end='')",
    ) === "created";
});

test.afterAll(async () => {
  if (courseSlug) {
    await owner.request.delete(`${TENANT}/api/v1/courses/${courseSlug}/`);
  }
  inTenant(
    "from apps.accounts.models import User\n" +
      "from apps.billing.models import Payment, SubscriptionPlan\n" +
      `Payment.objects.filter(provider_payment_id='${ENDED_MARK}').delete()\n` +
      `SubscriptionPlan.objects.filter(name='${PLAN_NAME}').delete()\n` +
      (createdStaff
        ? `User.objects.filter(email='${STAFF_EMAIL}').delete()`
        : "pass"),
  );
  await owner?.close();
});

test("the owner sells the course once for a year and includes it in Gold after a month", async () => {
  const page = await owner.newPage();
  await page.goto(`${TENANT}/admin/courses/${courseSlug}`);

  const buy = page.locator("#access-course-buy");
  await expect(buy).toBeVisible();
  await buy.click();
  await page.locator("#access-course-price").fill("49");
  // Buyers keep it: the pill opens the panel, the preset picks a year.
  await page.getByRole("button", { name: "Forever", exact: true }).click();
  await page.getByRole("button", { name: "1 year", exact: true }).click();

  // Gold: ticked in the subscriptions list, opening after a month of membership.
  await page.locator("#access-course-plans").click();
  await page.locator(`#access-course-plan-${planId}`).click();
  await page
    .getByRole("button", { name: "Right away · never closes", exact: true })
    .click();
  await page.getByRole("button", { name: "After a wait", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Number of days" }).fill("30");

  const saved = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/admin/access/course/${courseId}/`) &&
      r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save Changes" }).click();
  expect((await saved).status()).toBe(200);

  const got = await ways();
  expect(got.ways.free).toBeNull();
  expect(got.ways.buy).toEqual({
    price: "49.00",
    window: { closes_after_days: 365 },
  });
  expect(got.ways.plans).toEqual([
    { plan_id: planId, window: { opens_after_days: 30 } },
  ]);
  expect(got.describe).toContain("with 1 year of access");
  expect(got.describe).toContain("after 1 month of membership");
  await page.close();
});

test("a visitor is offered Buy for €49 with a year of access, and Gold after a month of membership", async ({
  browser,
}) => {
  // The price reads in the currency the tenant charges, whichever that is.
  const { currency } = await ways();
  const forty9 = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(49);
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${TENANT}/courses/${courseSlug}`);

  await expect(page.getByText(`Buy for ${forty9}`)).toBeVisible();
  await expect(page.getByText("1 year of access")).toBeVisible();
  await expect(page.getByText(PLAN_NAME)).toBeVisible();
  await expect(
    page.getByText("Opens after 1 month of membership"),
  ).toBeVisible();
  await visitor.close();
});

test("a buyer whose year has run out is told their access ended, and may buy again", async ({
  browser,
}) => {
  // The first seeded student bought it a year and a bit ago: the stamp closed 35 days back.
  inTenant(
    "from datetime import timedelta\n" +
      "from decimal import Decimal\n" +
      "from django.contrib.contenttypes.models import ContentType\n" +
      "from django.utils import timezone\n" +
      "from apps.accounts.models import User\n" +
      "from apps.billing.models import Payment, PaymentItem\n" +
      "from apps.courses.models import Course, Enrollment\n" +
      "student = User.objects.filter(role='student').order_by('id').first()\n" +
      `course = Course.objects.get(pk=${courseId})\n` +
      "now = timezone.now()\n" +
      "payment = Payment.objects.create(student=student, payment_type='one_time', status='completed', " +
      "amount=Decimal('49.00'), platform_fee=Decimal('0.00'), submerchant_payout=Decimal('49.00'), " +
      `currency='EUR', provider='bypass', provider_payment_id='${ENDED_MARK}')\n` +
      "PaymentItem.objects.create(payment=payment, content_type=ContentType.objects.get_for_model(Course), " +
      "object_id=course.pk, item_price=Decimal('49.00'), submerchant_payout=Decimal('49.00'), " +
      "access_starts_at=now - timedelta(days=400), access_ends_at=now - timedelta(days=35), is_refunded=False)\n" +
      // Checkout enrolls the buyer too, and the enrollment outlives the window.
      "Enrollment.objects.update_or_create(user=student, course=course, defaults={'is_active': True}, " +
      "create_defaults={'payment_id': payment.pk})",
  );
  const student = await studentContext(browser);
  const page = await student.newPage();
  await page.goto(`${TENANT}/courses/${courseSlug}`);

  await expect(
    page.getByText(/Your access ended on \d{1,2} \w{3} \d{4}/),
  ).toBeVisible();
  await expect(page.getByText("Buy for", { exact: false })).toBeVisible();
  await expect(page.getByText("Continue Learning")).toHaveCount(0);
  await student.close();
});

test("Free for everyone covers the other ways, and keeps their settings", async () => {
  const page = await owner.newPage();
  await page.goto(`${TENANT}/admin/courses/${courseSlug}`);

  await expect(page.locator("#access-course-buy")).toBeVisible();
  await page.locator("#access-course-free").click();
  await expect(
    page.getByText("Free for everyone covers every student,"),
  ).toBeVisible();

  const saved = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/admin/access/course/${courseId}/`) &&
      r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save Changes" }).click();
  expect((await saved).status()).toBe(200);

  const got = await ways();
  expect(got.ways.free).toEqual({ window: null });
  expect(got.ways.buy.price).toBe("49.00");
  expect(got.ways.plans).toHaveLength(1);
  await page.close();
});

test("unticking the last way is refused with a note, and nothing is saved", async () => {
  const page = await owner.newPage();
  await page.goto(`${TENANT}/admin/courses/${courseSlug}`);

  await expect(page.locator("#access-course-free")).toBeVisible();
  // Free covers the others (they cannot be clicked), so Free goes first.
  await page.locator("#access-course-free").click();
  await page.locator("#access-course-buy").click();
  await page.locator("#access-course-plans").click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Keep at least one way ticked" }),
  ).toBeVisible();
  await expect(page.locator("#access-course-plans")).toBeChecked();

  // The page was never saved: the course still has all three ways.
  const got = await ways();
  expect(got.ways.free).not.toBeNull();
  expect(got.ways.buy).not.toBeNull();
  expect(got.ways.plans).toHaveLength(1);
  await page.close();
});

test("a coach who is not the owner sees the subscriptions read-only", async ({
  browser,
}) => {
  const staff = await staffContext(browser);
  const page = await staff.newPage();
  await page.goto(`${TENANT}/admin/courses/${courseSlug}`);

  await expect(page.locator("#access-course-buy")).toBeVisible();
  await expect(
    page.getByText(
      "Only the site owner changes which subscriptions include this.",
    ),
  ).toBeVisible();
  await expect(page.locator("#access-course-plans")).toBeDisabled();
  await expect(page.locator(`#access-course-plan-${planId}`)).toBeDisabled();
  await expect(page.getByText(PLAN_NAME, { exact: true })).toBeVisible();
  // Its terms read as words, not a control.
  await expect(
    page.getByText("After 1 month of membership · never closes"),
  ).toBeVisible();
  await staff.close();
});
