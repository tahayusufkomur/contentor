export interface AccessInfo {
  has_access: boolean
  pricing_type: string
  price: string | null
  currency: string | null
  access_reason: string | null
  unlock_methods: string[] | null
}

export interface BundleItem {
  id: number
  content_type: number
  object_id: number
  content_type_name: string
}

export interface Bundle {
  id: number
  name: string
  description: string
  price: string
  currency: string
  thumbnail_url: string
  is_active: boolean
  item_count: number
  access_info: AccessInfo
  items?: BundleItem[]
  original_price?: string
  created_at: string
  updated_at: string
}

export interface StoreItem {
  id: number
  title: string
  description: string
  type: 'course' | 'download' | 'live_class' | 'live_stream' | 'bundle'
  price: string
  currency: string
  thumbnail_url: string
  is_active: boolean
  item_count: number
  original_price: string | null
  access_info: AccessInfo
}

export interface CartItem {
  content_type: string
  object_id: number
  title: string
  price: string
  currency?: string
  type: string
}

export interface SubscriptionPlan {
  id: number
  name: string
  description: string
  price: string
  currency: string
  billing_interval_months?: number
  item_count?: number
  is_subscribed?: boolean
}

export interface PlanAccessItem {
  type: string
  id: number
  title: string
  slug?: string
  thumbnail_url?: string
}

export interface SubscriptionPlanDetail extends SubscriptionPlan {
  items: PlanAccessItem[]
  is_subscribed?: boolean
}
