/**
 * Client-side helpers for the platform-subscription API.
 *
 * Marketing-site users hit these from the pricing CTA. On the marketing apex
 * the user is typically not logged in yet — `startCheckout` will surface
 * 401/403 by throwing, and the caller can route to /signup. Once authenticated
 * (post-signup), the call goes through with the user's JWT cookie and the
 * tenant Host on the same domain, so we don't need to thread an explicit
 * `X-Tenant-Domain` header from the browser.
 */

import { ApiError } from "@/types/api";

export interface StartCheckoutResponse {
  checkout_url: string;
  expires_at: string;
  provider: string;
}

export interface CheckoutError {
  status: number;
  code?: string;
  detail?: string;
  currency?: string;
}

/**
 * POST /api/v1/billing/platform/checkout/.
 *
 * On 2xx: returns the response. The caller is expected to `window.location.assign(...)` the
 * `checkout_url`. On non-2xx: throws an `ApiError` with a structured body so
 * callers can branch on `error.body.error`.
 */
export async function startCheckout(
  planId: number,
): Promise<StartCheckoutResponse> {
  const res = await fetch("/api/v1/billing/platform/checkout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow JSON parse failure — body stays a generic detail
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}

export interface PlanSummary {
  id: number;
  name: string;
  is_free: boolean;
  currency: string;
  amount_cents: number | null;
  stripe_price_id_present: boolean;
  max_students: number;
  max_storage_gb: number;
  max_streaming_hours: number;
  max_campaign_emails: number;
}

export interface PlansResponse {
  region: string;
  currency: string;
  plans: PlanSummary[];
}

export async function listPlans(): Promise<PlansResponse> {
  const res = await fetch("/api/v1/billing/platform/plans/", {
    method: "GET",
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new ApiError(res.status, { detail: "Failed to fetch plans" });
  }
  return res.json();
}
