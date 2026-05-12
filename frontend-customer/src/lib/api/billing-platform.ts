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
