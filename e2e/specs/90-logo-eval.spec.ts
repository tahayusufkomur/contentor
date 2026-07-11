// Manual eval wall: renders real conversation candidates for fixed briefs
// into eval-shots/ so prompt changes are judged on before/after evidence.
// Excluded from the default suite: requires LOGO_EVAL=1 and a live AI
// provider. If the dev stack uses the cli provider, probe its session
// limits first (see memory note: CLI batch evals can exhaust the dev
// subscription mid-run).
import { expect, test } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const BRIEFS = [
  {
    name: "Stillpoint Yoga",
    niche: "yoga and breathwork",
    vibe: "calm, earthy, premium",
  },
  { name: "Glow Atelier", niche: "beauty coaching", vibe: "feminine, elegant" },
  {
    name: "Shipfast Labs",
    niche: "developer career coaching",
    vibe: "technical, sharp",
  },
  {
    name: "Ledger & Latte",
    niche: "personal finance",
    vibe: "trustworthy, warm",
  },
];

test.describe("logo eval wall", () => {
  test.skip(!process.env.LOGO_EVAL, "manual: set LOGO_EVAL=1 to run");

  for (const brief of BRIEFS) {
    test(`contact sheet: ${brief.name}`, async ({ browser }) => {
      test.setTimeout(300_000);
      const coach = await coachContext(browser);
      const page = await coach.newPage();

      // Login as the seeded coach + open the studio — reuses the exact
      // navigation + heading assertion 15-logo-studio.spec.ts uses.
      await page.goto(`${TENANT}/admin/design?studio=1`);
      await expect(
        page.getByRole("heading", { name: "Logo Studio" }),
      ).toBeVisible();

      const dialog = page.getByRole("dialog");

      // Fresh tenants land on the Brief step; tenants with a saved design
      // land in the Editor — normalize by navigating to the Brief either
      // way (same as 15-logo-studio.spec.ts).
      const briefHeading = dialog.getByText("Tell us about your brand");
      if (!(await briefHeading.isVisible())) {
        await dialog.getByRole("button", { name: "Get new ideas" }).click();
      }
      await expect(briefHeading).toBeVisible();

      // Fill the brief fields with `brief`, continue to Ideas.
      const nameInput = dialog.getByLabel("Brand name");
      await nameInput.fill(brief.name);
      await dialog.getByLabel("What do you teach?").fill(brief.niche);
      await dialog
        .getByPlaceholder("e.g. calm, earthy, premium but approachable")
        .fill(brief.vibe);
      await dialog
        .getByRole("button", { name: "Show my logo ideas" })
        .click();

      await expect(dialog.getByTestId("logo-wall")).toBeVisible();

      // Open Design with AI, wait for the first candidates.
      await dialog
        .getByRole("button", { name: "Design with AI" })
        .click();
      await expect(
        page.getByTestId("studio-chat").getByTestId("chat-design-card").first(),
      ).toBeVisible({ timeout: 240_000 });
      await page.getByTestId("studio-chat").screenshot({
        path: `eval-shots/${brief.name.toLowerCase().replace(/\W+/g, "-")}-icons.png`,
      });

      await coach.close();
    });
  }
});
