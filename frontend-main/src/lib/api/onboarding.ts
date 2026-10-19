/**
 * Client-side helpers for the post-verify onboarding endpoints.
 *
 * Reuses the signup token (the magic link token used to verify the email).
 * No JWT is involved yet — the coach won't have one until they log in on
 * their tenant subdomain after provisioning completes.
 */

import type { CheckoutStart } from "@shared/checkout/embedded-checkout";
import { ApiError } from "@/types/api";

export interface SeedFromTemplateResponse {
  slug: string;
  status: string;
  template_status: string;
}

/**
 * Logged-in coach creating an additional platform — skips the email
 * verification round-trip. The session cookie proves email ownership, so the
 * backend mints the signup token directly and we resume at `/signup/verify`.
 */
export async function createPlatformAuthenticated(
  brandName: string,
  aboutText = "",
): Promise<{ token: string }> {
  const res = await fetch("/api/v1/onboarding/signup/authenticated/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ brand_name: brandName, about_text: aboutText }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}

export interface ExtractedFact {
  field: string;
  label: string;
  value: string;
  answers: string;
}

export interface ExtractDocResponse {
  text: string;
  facts: ExtractedFact[];
  summary: string;
  /** The studio name says one thing, the bio another ("dance" vs "face yoga and yoga"). */
  conflict: { name_says: string; bio_says: string } | null;
}

/**
 * Extract plain text from an uploaded bio/CV/document (.pdf, .txt, .md)
 * or normalize pasted text, and return real-time extracted facts.
 */
export async function extractDoc(
  file?: File,
  text?: string,
  brand?: string,
): Promise<ExtractDocResponse> {
  let body: FormData | string;
  const headers: Record<string, string> = {};
  if (file) {
    const fd = new FormData();
    fd.append("file", file);
    if (text) fd.append("text", text);
    if (brand) fd.append("brand", brand);
    body = fd;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ text: text || "", brand: brand || "" });
  }
  const res = await fetch("/api/v1/onboarding/extract-doc/", {
    method: "POST",
    headers,
    credentials: "same-origin",
    body,
  });
  if (!res.ok) {
    let errBody: unknown = { detail: "Request failed" };
    try {
      errBody = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  return res.json();
}

/**
 * Pre-wizard step 1: is this brand name available? Read-only — no token
 * minted, no email sent. With ``review``, an available name also comes back
 * with an AI typo fix and alternatives (only names still free to take).
 */
export async function checkBrandName(
  brandName: string,
  review = false,
): Promise<{
  available: boolean;
  detail?: string;
  typo_fix?: string;
  suggestions?: string[];
}> {
  const res = await fetch("/api/v1/onboarding/check-brand-name/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ brand_name: brandName, review }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}

/**
 * "Need a name?": a few brand-name ideas for what the coach teaches (only
 * names still free to take). Empty when the AI is unavailable.
 */
export async function getNameIdeas(
  topic: string,
  firstName = "",
): Promise<string[]> {
  const res = await fetch("/api/v1/onboarding/check-brand-name/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ideas: topic, first_name: firstName }),
  });
  if (!res.ok) throw new ApiError(res.status, { detail: "Request failed" });
  return ((await res.json()).ideas as string[] | undefined) ?? [];
}

export async function seedFromTemplate(
  token: string,
  niche: string,
  goals: string[],
): Promise<SeedFromTemplateResponse> {
  const res = await fetch("/api/v1/onboarding/seed-from-template/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token, niche, goals }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}

export async function skipTemplate(
  token: string,
): Promise<SeedFromTemplateResponse> {
  const res = await fetch("/api/v1/onboarding/skip-template/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}

export async function requestHandoff(
  token: string,
): Promise<{ login_url: string }> {
  const res = await fetch("/api/v1/onboarding/handoff/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("handoff_failed");
  return res.json();
}

/** The trial's Stripe Checkout: the card comes before the site is built. */
export async function startSignupCheckout(
  token: string,
): Promise<CheckoutStart> {
  const res = await fetch("/api/v1/onboarding/signup/checkout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("checkout_failed");
  return res.json();
}

/** Re-send the "continue your setup" email for an expired link. */
export async function recoverSignup(token: string): Promise<void> {
  const res = await fetch("/api/v1/onboarding/wizard/recover/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
}
