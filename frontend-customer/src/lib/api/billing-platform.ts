/**
 * Client-side helpers for the platform-subscription API (coach side).
 *
 * Used by the admin/billing Subscription tab.
 */

import { clientFetch } from '@/lib/api-client'

export type PlatformSubscriptionStatus =
  | 'free'
  | 'incomplete'
  | 'active'
  | 'past_due'
  | 'canceled'

export interface PlanBrief {
  id: number | null
  name: string
  is_free: boolean
}

export interface PlatformSubscriptionState {
  status: PlatformSubscriptionStatus
  plan: PlanBrief
  provider?: string
  currency?: string
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  is_active: boolean
}

export async function getSubscription(): Promise<PlatformSubscriptionState> {
  return clientFetch<PlatformSubscriptionState>('/api/v1/billing/platform/subscription/')
}

export interface StartCheckoutResponse {
  checkout_url: string
  expires_at: string
  provider: string
}

export async function startCheckout(planId: number): Promise<StartCheckoutResponse> {
  return clientFetch<StartCheckoutResponse>('/api/v1/billing/platform/checkout/', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId }),
  })
}

export interface PlatformPlanPriceEntry {
  amount_cents: number | null
  /** True when a Stripe price id is configured for this currency. The id
   *  itself is intentionally kept server-side. */
  available: boolean
}

export interface PlatformPlanSummary {
  id: number
  name: string
  is_free: boolean
  /** Region-default currency the backend chose for the legacy flat
   *  `amount_cents` field. Not used by the in-tenant upgrade card — it
   *  resolves its own currency. */
  currency: string
  amount_cents: number | null
  /** Per-currency price + availability map. */
  prices: Record<string, PlatformPlanPriceEntry>
  max_students: number
  max_storage_gb: number
  max_streaming_hours: number
  max_campaign_emails: number
}

export interface ListPlatformPlansResponse {
  region: string
  currency: string
  plans: PlatformPlanSummary[]
}

export async function listPlatformPlans(): Promise<ListPlatformPlansResponse> {
  return clientFetch<ListPlatformPlansResponse>('/api/v1/billing/platform/plans/')
}
