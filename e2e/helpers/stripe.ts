/**
 * Stripe test-mode helpers.
 *
 * `payStripeCheckout` navigates a Stripe-hosted Checkout page and pays with
 * the universal test card 4242 4242 4242 4242.
 *
 * Two Stripe Checkout layouts are handled:
 *
 * 1. Standard `checkout.stripe.com` (platform subscriptions, single PM):
 *    - Card number / expiry / CVC / name / ZIP rendered as plain inputs.
 *    - Submit button: data-testid="hosted-payment-submit-button".
 *
 * 2. `accessible.stripe.com` (Connect / Adaptive Pricing, multi-PM):
 *    - Shows a currency selector ("Choose a currency:") and a payment method
 *      radio list (Card, iDEAL, Bancontact, EPS, …).
 *    - The card input form lives INSIDE an iframe in the <main> region.
 *    - Strategy: detect via the currency selector group → click USD button →
 *      click "Pay with card" to expand the card iframe → fill via frameLocator.
 *    - Submit button: button "Pay" (no data-testid).
 *
 * Detection: presence of a "Choose a currency:" text group distinguishes the
 * accessible/Connect layout from the standard one. The previous approach used
 * data-testid="card-accordion-item" which does not exist in the actual DOM.
 */

import { Page, expect } from "@playwright/test";

export async function payStripeCheckout(page: Page) {
  await expect(page).toHaveURL(/checkout\.stripe\.com|accessible\.stripe\.com/, { timeout: 20_000 });

  // Detect layout by the UNIQUE signal: the currency selector only appears on
  // accessible.stripe.com (Connect checkout). The hosted-payment-submit-button
  // appears on BOTH layouts so cannot be used for differentiation.
  // We wait up to 10 s for the currency selector; if not found, assume standard.
  const isConnectLayout = await page
    .getByText("Choose a currency:")
    .waitFor({ state: "attached", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  console.log("[stripe helper] isConnectLayout:", isConnectLayout);

  if (isConnectLayout) {
    // ── accessible.stripe.com: Connect multi-PM layout ───────────────────────
    // The page has:
    //   - A currency selector group (EU disabled, US enabled)
    //   - main > iframe  (the actual Stripe payment element — card inputs live here)
    //   - A "Payment method" radio list (Card, iDEAL | Wero, Bancontact, EPS, …)
    //   - "Pay with card" button to expand the card form
    //   - A "Pay" submit button

    // Step 1: Switch to USD (the $x.xx button in the currency selector).
    // The EU button is highlighted/selected by default; the US button shows "$9.99".
    // We match the enabled currency button (the one NOT disabled) that has "$" in its text.
    // The "EU" / "US" text is in <img alt="..."> so it's not in the button's text content;
    // match on the dollar sign in the price text instead.
    const usdBtn = page.locator('button[type="button"]').filter({ hasText: /\$\d/ }).and(
      // Exclude buttons that are disabled
      page.locator(':not([disabled])')
    );
    // Wait for the currency group to fully render (locator by label to avoid strict-mode issues
    // on pages that have multiple role=group elements like billing address fieldsets).
    await expect(page.getByRole("group", { name: /choose a currency/i })).toBeAttached({ timeout: 10_000 });
    const usdCount = await usdBtn.count().catch(() => 0);
    console.log("[stripe helper] USD button count:", usdCount);
    if (usdCount > 0) {
      const usdVisible = await usdBtn.first().isVisible({ timeout: 3_000 }).catch(() => false);
      console.log("[stripe helper] USD button visible:", usdVisible);
      if (usdVisible) {
        await usdBtn.first().click();
        // Wait for the payment method list to re-render with USD.
        await page.waitForTimeout(2_000);
        console.log("[stripe helper] After USD click, URL:", page.url());
      }
    }

    // Step 2: Select the "Card" payment method to expand the card form.
    // The Card accordion item has an overlay button (data-testid="card-accordion-item-button",
    // class AccordionButton) that intercepts all pointer events on the header row.
    // Playwright's .click() on the radio beneath the overlay retries forever.
    // The AccordionButton itself may be 0×0 (collapsed) or outside the viewport.
    //
    // Solution: fire a MouseEvent directly on the AccordionButton via page.evaluate().
    // React's synthetic event system responds to bubbled native events, so dispatching
    // a full mousedown/mouseup/click sequence on the button (not just the radio) triggers
    // the accordion expansion in Stripe's React app.
    console.log("[stripe helper] Expanding Card accordion via JS mouse events...");
    const accordionFound = await page.evaluate((): boolean => {
      const btn = document.querySelector('[data-testid="card-accordion-item-button"]') as HTMLElement | null;
      if (!btn) return false;
      // Get the accordion cover (the clickable header area) to find coordinates.
      const cover = btn.closest('.AccordionItemCover') as HTMLElement | null;
      const target = cover || btn;
      const rect = target.getBoundingClientRect();
      // Click in the center of the cover; if 0×0 (element not laid out), fall back to
      // window.innerWidth/2 so the synthetic event still lands in the visible viewport area.
      const x = rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect.height > 0 ? rect.top + rect.height / 2 : (rect.top || btn.offsetTop) + 25;
      for (const type of ["mousedown", "mouseup", "click"] as const) {
        btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
      }
      return true;
    });
    if (!accordionFound) {
      throw new Error(
        "Stripe Connect checkout: card-accordion-item-button testid not found — Stripe may have changed their checkout DOM"
      );
    }
    // Wait for Stripe to render the card form in the page DOM.
    await page.waitForTimeout(2_000);

    // Step 3: Fill card fields directly in the page DOM.
    // After the Card radio is selected, Stripe renders the card inputs inline
    // in the AccordionItemContent div — NOT inside an iframe. The inputs are
    // plain <input> elements with the standard Stripe placeholders.
    const cardField = page.getByPlaceholder(/1234 1234 1234 1234/);
    await expect(cardField).toBeVisible({ timeout: 15_000 });
    console.log("[stripe helper] Card field visible in page DOM");
    await cardField.click();
    await cardField.pressSequentially("4242424242424242", { delay: 50 });

    const expiryField = page.getByPlaceholder(/MM \/ YY/);
    await expiryField.click();
    await expiryField.pressSequentially("1234", { delay: 50 });

    const cvcField = page.getByRole("textbox", { name: /cvc/i });
    await cvcField.click();
    await cvcField.pressSequentially("123", { delay: 50 });

    const nameField = page.getByLabel(/cardholder name|name on card/i);
    if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameField.fill("E2E Tester");
    }

    // Step 4: Submit via the page-level "Pay" button (outside the iframe).
    const submitBtn = page.getByRole("button", { name: /^Pay$/ });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    console.log("[stripe helper] Clicking Pay button...");
    await submitBtn.click();
  } else {
    // ── checkout.stripe.com: standard single-PM layout ───────────────────────
    // Wait for the submit button to confirm the form has rendered.
    const submitBtn = page.getByTestId("hosted-payment-submit-button");
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });

    // Email field — present when Stripe does not already know the customer's email.
    const emailField = page.getByLabel(/email/i).first();
    if (await emailField.isVisible()) {
      await emailField.fill("e2e-tester@contentor.test");
    }

    const cardField = page.getByPlaceholder(/1234 1234 1234 1234/);
    await expect(cardField).toBeVisible({ timeout: 10_000 });
    await cardField.click();
    await cardField.pressSequentially("4242424242424242", { delay: 50 });

    const expiryField = page.getByPlaceholder(/MM \/ YY/);
    await expiryField.click();
    await expiryField.pressSequentially("1234", { delay: 50 });

    const cvcField = page.getByPlaceholder(/CVC/);
    await cvcField.click();
    await cvcField.pressSequentially("123", { delay: 50 });

    const nameField = page.getByLabel(/name on card|cardholder name/i);
    if (await nameField.isVisible()) {
      await nameField.fill("E2E Tester");
    }

    const postalField = page.getByPlaceholder(/zip|postal code/i);
    if (await postalField.isVisible()) {
      await postalField.fill("12345");
    }

    await submitBtn.click();
  }
}
