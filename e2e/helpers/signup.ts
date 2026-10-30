import { expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "./email";
import { manage } from "./compose";
import en from "../../frontend-main/messages/en/auth.json";

/** The signup page's own texts: English by default, the page's language when a spec signs up elsewhere. */
type SignupTexts = Pick<typeof en.signup, "namePlaceholder" | "emailPlaceholder" | "submit" | "verifyTitle">;

// Signup asks only who you are: the site is named, and its bio added, in /setup.
// Returns the verification email (its subject is for specs that read it).
export async function signupThroughVerify(
  page: Page,
  email: string,
  { path = "/signup", texts = en.signup, name = "E2E Coach" }: { path?: string; texts?: SignupTexts; name?: string } = {},
) {
  await page.goto(`http://localhost${path}`);
  await page.getByPlaceholder(texts.namePlaceholder).fill(name);
  await page.getByPlaceholder(texts.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: texts.submit }).click();
  await expect(page.getByRole("heading", { name: texts.verifyTitle })).toBeVisible({ timeout: 10_000 });
  const mail = await latestEmail(email);
  const link = firstLink(mail.html);
  expect(link, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(link);
  return mail;
}

/** The card comes before the site: the Starter trial at Stripe Checkout.
 * Without Stripe the spec records the trial the webhook would. */
export function grantTrial(email: string, stamp: number, name = "E2E Coach") {
  manage([
    "shell",
    "-c",
    "from datetime import timedelta\n" +
      "from django.utils import timezone\n" +
      "from apps.accounts.models import User\n" +
      "from apps.core import languages\n" +
      "from apps.core.models import PlatformPlan, PlatformSubscription, Tenant\n" +
      `t = Tenant.objects.get(owner_email='${email}')\n` +
      // The checkout endpoint makes the owner's platform account, in the language she signed up in; the spec skips it.
      "u = User.objects.get_or_create(email=t.owner_email, region=t.region, defaults=dict(name='" +
      name +
      "', role='coach', preferred_locale=languages.resolve((t.wizard_state or {}).get('locale'))))[0]\n" +
      "PlatformSubscription.objects.update_or_create(tenant=t, defaults=dict(\n" +
      "    user=u, plan=PlatformPlan.objects.get(name='starter'),\n" +
      `    status='trialing', provider='stripe', provider_subscription_id='sub_e2e_${stamp}',\n` +
      "    current_period_end=timezone.now() + timedelta(days=14)))",
  ]);
}
