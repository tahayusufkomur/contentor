import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";

const stamp = Date.now();

async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByRole("button", { name: en.signup.submit }).click();
  // The AI may offer a typo fix or alternatives first; Continue keeps the name.
  const nameField = page.getByPlaceholder(en.signup.namePlaceholder);
  const keep = page.getByText(en.signup.nameKeep);
  const skipAbout = page.getByRole("button", { name: en.signup.aboutSkip });
  await expect(skipAbout.or(keep)).toBeVisible({ timeout: 20_000 });
  if (await keep.isVisible()) await page.getByRole("button", { name: en.signup.submit }).click();
  // The optional "about you" step: the spec signs up without a bio.
  await skipAbout.click();
  await nameField.fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });
  const mail = await latestEmail(email);
  const link = firstLink(mail.html);
  expect(link, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(link);
}

/** Going live starts the Starter trial at Stripe Checkout (card upfront).
 * Without Stripe the spec records the trial the webhook would. */
function grantTrial() {
  manage([
    "shell",
    "-c",
    "from datetime import timedelta\n" +
      "from django.utils import timezone\n" +
      "from apps.accounts.models import User\n" +
      "from apps.core.models import PlatformPlan, PlatformSubscription, Tenant\n" +
      `t = Tenant.objects.get(slug='e2e-studio-${stamp}')\n` +
      "PlatformSubscription.objects.update_or_create(tenant=t, defaults=dict(\n" +
      "    user=User.objects.filter(email=t.owner_email).first(), plan=PlatformPlan.objects.get(name='starter'),\n" +
      `    status='trialing', provider='stripe', provider_subscription_id='sub_e2e_${stamp}',\n` +
      "    current_period_end=timezone.now() + timedelta(days=14)))",
  ]);
}

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs (raw SQL for the
  // cross-schema PlatformSubscription FK; see git history of this spec).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-studio-'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
});

test("signup lands in /setup and the interview ends in a published site", async ({ page }) => {
  // Real AI or the pre-written fallback: the tiles exist in both, so the
  // spec is structurally deterministic. Page builds on the AI hub are slow.
  test.setTimeout(1_200_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}`, `e2e-coach-${stamp}@contentor.test`);

  await page.waitForURL(/e2e-studio-[\w-]+\.localhost\/setup/, { timeout: 120_000 });
  await expect(page.getByText("What do you teach?")).toBeVisible({ timeout: 30_000 });

  // First answer typed; then "Pick for me" where the guide may decide, the
  // first tile (and Continue) where only the coach knows, a typed answer
  // when a fallback question has neither, until go-live.
  const answer = page.getByLabel("Your answer");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await answer.fill("Yoga for people who sit at a desk all day");
  await send.click();

  const guide = page.getByRole("region", { name: "Your setup guide" });
  // What the guide shows while a turn, an edit or a page build is in flight
  // (a turn past 12 s reads "Still thinking…").
  const busy = guide.getByText(/Thinking…|Still thinking|Making that change|Finishing your pages|Confirming your plan/);
  const decide = guide.getByRole("button", { name: "Pick for me", exact: true });
  const tile = guide.locator("h1 ~ div.grid > button").first();
  const cont = guide.getByRole("button", { name: /^Continue/ });
  // The social-accounts question wants a handle for each network ticked.
  const handles = guide.getByPlaceholder(/yourname or @yourname$/);
  // The time-zone question opens on the browser's own zone: Continue takes it.
  const zone = guide.getByLabel("Time zone");
  // The in-person class asks for its place and address: two boxes, no tiles.
  const place = guide.getByPlaceholder("Studio Lumen, Kreuzberg");
  // A drafted course or class to approve.
  const looksGood = guide.getByRole("button", { name: "Looks good, continue" });
  const goLive = guide.getByRole("button", { name: "Go live", exact: true });
  // Going live starts the free trial first (Stripe Checkout, recorded here).
  const startTrial = guide.getByRole("button", { name: "Start free trial" });
  // The first payments tile is a paid one, and a trial cannot sell; the spec
  // takes the free way out instead of starting the plan.
  const makeFree = guide.getByRole("button", { name: "Make it free and go live now" });
  // The photos question: a screen of its own, with an upload and a way past it.
  const stockPhotos = guide.getByRole("button", { name: "Choose photos for me", exact: true });
  // A look tapped opens as a page; "Keep this look" answers the question.
  const keepLook = page.getByRole("button", { name: "Keep this look" });
  // Story and training tiles are sentence starters: a tap opens the sentence
  // in its card, and the coach finishes it there. The guide never writes a coach's story for them,
  // so those questions take a real answer, not "you decide" words.
  const ownWords = async () => {
    const q = await guide.getByRole("heading", { level: 1 }).innerText();
    if (/teach this|story|inspired|come to/i.test(q))
      return "I started teaching after yoga eased my own back pain from years at a desk.";
    if (/training|certif|background|experience|qualif/i.test(q))
      return "I completed a 200-hour yoga teacher training in 2019.";
    return "Whatever you think fits best";
  };
  const action = decide
    .or(looksGood)
    .or(goLive)
    .or(startTrial)
    .or(makeFree)
    .or(tile)
    .or(zone)
    .or(place)
    .or(stockPhotos);
  for (let i = 0; i < 40; i++) {
    // Wait for the work in flight to finish, then for the next screen's controls.
    await busy.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
    // Every busy line gone (a change and a page build can show at once).
    await expect(busy).toHaveCount(0, { timeout: 300_000 });
    await action.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    await keepLook.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
    if (await keepLook.isVisible()) await keepLook.click();
    if (await goLive.isVisible()) break;
    if (await startTrial.isVisible()) {
      grantTrial();
      await page.reload();
      continue;
    }
    if (await makeFree.isVisible()) {
      await makeFree.click();
      // Going free first says what it changes, then asks (nothing to change: no ask).
      await guide
        .getByRole("button", { name: "Yes, make it free" })
        .click({ timeout: 10_000 })
        .catch(() => {});
      await expect(goLive).toBeVisible({ timeout: 600_000 });
      break;
    }
    if (await looksGood.isVisible()) {
      // Enabled once the draft is ready (it drafts in the background).
      await looksGood.click({ timeout: 300_000 });
      continue;
    }
    if (await stockPhotos.isVisible()) {
      // A photo of her own goes up, is made web-ready and counts for the shape
      // it has; removed again, the photos are left to the guide, so the rest
      // of the run builds the site it always has.
      await guide.getByLabel("Add photos").setInputFiles("fixtures/own-photo.jpg");
      const mine = guide.getByRole("list", { name: "Your photos" }).getByRole("listitem");
      await expect(mine).toHaveCount(1);
      await expect(mine.getByText("Added")).toBeVisible({ timeout: 60_000 });
      await expect(guide.getByRole("button", { name: "Continue with my photo" })).toBeEnabled();
      await expect(guide.getByLabel("What to bring").getByText("1 of 3 added")).toBeVisible();
      await mine.getByRole("button", { name: /^Remove/ }).click();
      await expect(mine).toHaveCount(0);
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
      await place.fill("E2E Studio");
      await guide.getByPlaceholder("Hauptstraße 12, 10827 Berlin").fill("Teststr. 1, 10115 Berlin");
      await cont.click();
      continue;
    }
    if (await tile.isVisible()) {
      await tile.click();
      for (const handle of await handles.all()) await handle.fill("e2estudio");
      // A starter tile opened as a card: finish its sentence there, in the coach's words.
      const finish = guide.getByLabel(/^Finish the sentence/);
      if (await finish.count()) await finish.first().fill(await ownWords());
      await cont.click();
      continue;
    }
    await answer.fill(await ownWords());
    await send.click();
  }
  await expect(goLive).toBeVisible({ timeout: 600_000 });
  await goLive.click();
  await expect(page.getByRole("button", { name: "Go to your admin panel" })).toBeVisible({ timeout: 60_000 });
});
