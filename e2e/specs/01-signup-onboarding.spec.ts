import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";

const stamp = Date.now();
const email = `e2e-coach-${stamp}@contentor.test`;

// Signup asks only who you are: the site is named, and its bio added, in /setup.
async function signupThroughVerify(page: Page) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });
  const mail = await latestEmail(email);
  const link = firstLink(mail.html);
  expect(link, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(link);
}

/** The card comes before the site: the Starter trial at Stripe Checkout.
 * Without Stripe the spec records the trial the webhook would. */
function grantTrial() {
  manage([
    "shell",
    "-c",
    "from datetime import timedelta\n" +
      "from django.utils import timezone\n" +
      "from apps.accounts.models import User\n" +
      "from apps.core.models import PlatformPlan, PlatformSubscription, Tenant\n" +
      `t = Tenant.objects.get(owner_email='${email}')\n` +
      // The checkout endpoint makes the owner's platform account; the spec skips it.
      "u = User.objects.get_or_create(email=t.owner_email, region=t.region, defaults=dict(name='E2E Coach', role='coach'))[0]\n" +
      "PlatformSubscription.objects.update_or_create(tenant=t, defaults=dict(\n" +
      "    user=u, plan=PlatformPlan.objects.get(name='starter'),\n" +
      `    status='trialing', provider='stripe', provider_subscription_id='sub_e2e_${stamp}',\n` +
      "    current_period_end=timezone.now() + timedelta(days=14)))",
  ]);
}

// A real-AI run of several minutes: a failure here is rarely flaky, and a
// retry doubles the wait. Fail once.
test.describe.configure({ retries: 0 });

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs (raw SQL for the
  // cross-schema PlatformSubscription FK; see git history of this spec).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      // Named runs, and runs that stopped before the site was named.
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-studio-') | Tenant.objects.filter(owner_email__startswith='e2e-coach-', owner_email__endswith='@contentor.test'))\n" +
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
  await signupThroughVerify(page);
  // No site before the card: the verify page offers the trial first.
  await expect(page.getByRole("button", { name: en.signup.verify.card.cta })).toBeVisible({ timeout: 20_000 });
  grantTrial();
  await page.reload();

  // Until it is named, the site lives at a temporary address.
  await page.waitForURL(/new-site-[0-9a-f]+\.localhost\/setup/, { timeout: 120_000 });
  const guideAtStart = page.getByRole("region", { name: "Your setup guide" });

  // The first screen: her bio, read once (it ticks the questions ahead), or skipped.
  await expect(guideAtStart.getByRole("heading", { name: /Tell me about yourself/ })).toBeVisible({ timeout: 30_000 });
  await guideAtStart
    .getByLabel("Or write about your work")
    .fill("I teach yoga to people who sit at a desk all day, online and in small groups.");
  await guideAtStart.getByRole("button", { name: "Continue", exact: true }).click();
  const nameQuestion = guideAtStart.getByRole("heading", { name: /What's your site called/ });
  const unread = guideAtStart.getByRole("alert");
  await expect(nameQuestion.or(unread)).toBeVisible({ timeout: 60_000 });
  if (await unread.isVisible()) await guideAtStart.getByRole("button", { name: "Skip for now" }).click();

  // The second: her site's name, which makes its address, and says her own domain can come later.
  await expect(nameQuestion).toBeVisible({ timeout: 30_000 });
  await guideAtStart.getByLabel("Your site’s name").fill(`E2E Studio ${stamp}`);
  await expect(guideAtStart.getByText(`e2e-studio-${stamp}.localhost`)).toBeVisible();
  await expect(guideAtStart.getByText(/get your own domain/)).toBeVisible();
  await guideAtStart.getByRole("button", { name: "Continue", exact: true }).click();
  // The AI may offer a typo fix or alternatives first; Continue keeps the name.
  const keepName = guideAtStart.getByText("press Continue to keep your name");
  const offer = page.getByText("What do you offer?");
  await expect(keepName.or(offer)).toBeVisible({ timeout: 60_000 });
  if (await keepName.isVisible()) await guideAtStart.getByRole("button", { name: "Continue", exact: true }).click();
  // Named: the site moves to the address its name makes, still signed in.
  await page.waitForURL(new RegExp(`e2e-studio-${stamp}\\.localhost/setup`), { timeout: 60_000 });

  // No slides: each question explains itself in place. Its ⓘ opens a short
  // explanation, and closes again.
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await expect(guideAtStart.locator('[aria-roledescription="slide"]')).toHaveCount(0);
  const teamHelp = guideAtStart.getByRole("button", { name: "Who's on my team?" });
  await expect(teamHelp).toHaveAttribute("aria-expanded", "false");
  await teamHelp.click();
  await expect(teamHelp).toHaveAttribute("aria-expanded", "true");
  await expect(guideAtStart.getByText(/comes with a small team/)).toBeVisible();
  await teamHelp.click();
  await expect(guideAtStart.getByText(/comes with a small team/)).toHaveCount(0);

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
  // A drafted course or class to approve, or the line saying its draft failed.
  const looksGood = guide.getByRole("button", { name: "Looks good, continue" });
  const draftFailed = guide.getByText(/I couldn’t draft your/);
  const goLive = guide.getByRole("button", { name: "Go live", exact: true });
  // Before going live each built page is looked over and approved, one by one.
  const pageOk = guide.getByRole("button", { name: "This page looks good" });
  // The first payments tile is a paid one, and a trial cannot sell; the spec
  // goes live now and sells later instead of starting the plan. There is no
  // going free (decision 2026-10-17).
  const sellLater = guide.getByRole("button", { name: "Go live now, sell later" });
  // The photos question: a screen of its own, with an upload and a way past it.
  const stockPhotos = guide.getByRole("button", { name: "Choose photos for me", exact: true });
  // A look tapped opens as a page; "Keep this look" answers the question.
  const keepLook = page.getByRole("button", { name: "Keep this look" });
  // Story and training tiles are sentence starters: a tap opens the sentence
  // in its card, and the coach finishes it there. The guide never writes a coach's story for them,
  // so those questions take a real answer, not "you decide" words.
  const ownWords = async () => {
    const q = await guide.getByRole("heading", { level: 1 }).innerText();
    if (/teach this|story|inspired|come to|get into/i.test(q))
      return "I started teaching after yoga eased my own back pain from years at a desk.";
    if (/training|certif|background|experience|qualif/i.test(q))
      return "I completed a 200-hour yoga teacher training in 2019.";
    return "Whatever you think fits best";
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
    // Every busy line gone (a change and a page build can show at once).
    await expect(busy).toHaveCount(0, { timeout: 300_000 });
    await action.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    await keepLook.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
    if (await keepLook.isVisible()) await keepLook.click();
    if (await pageOk.isVisible()) {
      // Enabled once that page is built.
      await expect(pageOk).toBeEnabled({ timeout: 300_000 });
      await pageOk.click();
      continue;
    }
    if (await goLive.isVisible()) break;
    if (await sellLater.isVisible()) {
      await expect(guide.getByRole("button", { name: /make it free/i })).toHaveCount(0);
      await sellLater.click();
      await expect(goLive).toBeVisible({ timeout: 600_000 });
      break;
    }
    if (await looksGood.isVisible()) {
      // Enabled once the draft is ready (it drafts in the background). A failed
      // draft says so at once: fail then, instead of waiting out the timeout.
      await expect(looksGood.and(guide.locator("button:enabled")).or(draftFailed)).toBeVisible({ timeout: 300_000 });
      await expect(draftFailed, "the draft failed: see `docker compose logs celery-worker`").toHaveCount(0);
      await looksGood.click();
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
  await expect(page.getByRole("button", { name: "Go to your control panel" })).toBeVisible({ timeout: 60_000 });
  // The hand-off: the assistant's card says what it did, one of six specialists.
  await expect(page.getByText("Ran your setup.")).toBeVisible();
});
