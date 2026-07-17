export interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_email: string;
  is_active: boolean;
  provisioning_status: string;
  plan_name: string | null;
  subscription_status: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  created_at: string;
}

export interface PlatformPlanPriceEntry {
  amount_cents: number;
  stripe_price_id?: string;
}

export interface PlatformPlan {
  id: number;
  name: string;
  price_monthly: string;
  transaction_fee_pct: string;
  max_students: number;
  max_storage_gb: number;
  max_streaming_hours: number;
  max_campaign_emails: number;
  is_live_enabled: boolean;
  is_active: boolean;
  prices?: Record<string, PlatformPlanPriceEntry>;
}

export interface PlatformDashboard {
  total_tenants: number;
  active_tenants: number;
  total_students: number;
  total_storage_bytes: number;
  monetization_ready_tenants: number;
  plan_distribution: { plan: string; count: number }[];
  platform_subscriptions: {
    active_subscriptions: number;
    mrr_by_currency: Record<string, string>;
  };
  marketplace: {
    gross_by_currency: Record<string, string>;
    fees_by_currency: Record<string, string>;
    payment_count: number;
  };
  webhook_failures: number;
}

export interface PlatformSubscriptionRow {
  id: number;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  status: string;
  provider: string;
  amount: string;
  currency: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  created_at: string;
}

export interface WebhookEventRow {
  id: number;
  provider: string;
  provider_event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  processing_error: string;
}

// "69.80 USD · 245.70 TRY" for a {currency: amount} map.
export function formatCurrencyMap(
  map: Record<string, string> | undefined,
): string {
  if (!map) return "—";
  const parts = Object.entries(map).map(([cur, amount]) => `${amount} ${cur}`);
  return parts.length ? parts.join(" · ") : "—";
}
