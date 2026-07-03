/**
 * Client-side helpers for the post-verify onboarding endpoints.
 *
 * Reuses the signup token (the magic link token used to verify the email).
 * No JWT is involved yet — the coach won't have one until they log in on
 * their tenant subdomain after provisioning completes.
 */

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
): Promise<{ token: string }> {
  const res = await fetch("/api/v1/onboarding/signup/authenticated/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ brand_name: brandName }),
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
