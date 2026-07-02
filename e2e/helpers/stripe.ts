/**
 * Stripe test-mode helpers.
 *
 * `payStripeCheckout` navigates a Stripe-hosted Checkout page
 * (checkout.stripe.com) using the universal test card 4242 4242 4242 4242.
 *
 * Observed fields on Stripe Checkout (test mode, 2026):
 *   - Email field (if not pre-filled from Stripe Customer)
 *   - Card number, expiry (MM / YY), CVC
 *   - Name on card and postal/ZIP — conditionally present depending on locale
 *     and Stripe's fraud-signal heuristics; handled with explicit isVisible() guards.
 */

import { Page, expect } from "@playwright/test";

export async function payStripeCheckout(page: Page) {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 20_000 });

  // Wait for the submit button to be visible before interacting — ensures the
  // form has fully rendered including Stripe's card input components.
  const submitBtn = page.getByTestId("hosted-payment-submit-button");
  await expect(submitBtn).toBeVisible({ timeout: 15_000 });

  // Email field — present when Stripe does not already know the customer's email.
  const emailField = page.getByLabel(/email/i).first();
  if (await emailField.isVisible()) {
    await emailField.fill("e2e-tester@contentor.test");
  }

  // Card number — Stripe's hosted checkout renders these as standard <input> elements
  // (no Stripe.js iframes). Use pressSequentially to simulate real keystrokes so
  // Stripe's masked-input JS handlers register each character correctly.
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

  // Name on card — conditionally present.
  const nameField = page.getByLabel(/name on card|cardholder name/i);
  if (await nameField.isVisible()) {
    await nameField.fill("E2E Tester");
  }

  // Postal / ZIP — conditionally present.
  const postalField = page.getByPlaceholder(/zip|postal code/i);
  if (await postalField.isVisible()) {
    await postalField.fill("12345");
  }

  await submitBtn.click();
}
