export interface Tenant {
  id: number
  name: string
  slug: string
  owner_email: string
  is_active: boolean
  provisioning_status: string
  plan_name: string | null
  created_at: string
}

export interface PlatformPlan {
  id: number
  name: string
  price_monthly: string
  transaction_fee_pct: string
  max_students: number
  max_storage_gb: number
  max_streaming_hours: number
  max_campaign_emails: number
  is_live_enabled: boolean
}

export interface PlatformDashboard {
  total_tenants: number
  active_tenants: number
  total_students: number
  total_storage_bytes: number
}
