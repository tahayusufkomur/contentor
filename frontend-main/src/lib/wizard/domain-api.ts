/** Wizard-token custom-domain API client. Token rides in the BODY (never the
 * URL) — same convention as api.ts / logo-api.ts. Server side lives in
 * apps/domains/wizard_views.py, mounted under the onboarding wizard prefix. */

import { ApiError } from "@/types/api";
import type {
  CustomDomainStatus,
  DomainResult,
  RegistrantContact,
} from "@/lib/domains";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
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
  return res.json() as Promise<T>;
}

/** Availability search. POST so the token never lands in access logs. */
export function wizardDomainSearch(
  token: string,
  q: string,
): Promise<{ results: DomainResult[]; suggestions: DomainResult[] }> {
  return request("/api/v1/onboarding/wizard/domain/search/", {
    method: "POST",
    body: JSON.stringify({ token, q }),
  });
}

/** Start the domain purchase. The returned checkout_url leads to Stripe (or
 * the dev bypass) and lands back on /signup/verify on the SAME host, where
 * the stashed localStorage token resumes the wizard at the domain step. */
export function wizardDomainCheckout(
  token: string,
  body: { domain: string; contact: RegistrantContact },
): Promise<{ checkout_url: string; custom_domain_id: number }> {
  return request("/api/v1/onboarding/wizard/domain/checkout/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

/** Return-from-checkout probe + status read. `session_id` (Stripe return)
 * activates server-side without waiting for the webhook; `custom_domain_id`
 * (dev bypass return) activates directly; neither = plain status read. */
export function wizardDomainSync(
  token: string,
  body: { session_id?: string; custom_domain_id?: number } = {},
): Promise<{ custom_domain: CustomDomainStatus | null }> {
  return request("/api/v1/onboarding/wizard/domain/sync/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}
