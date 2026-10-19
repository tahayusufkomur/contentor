import type { CoverDesign } from "./design";

export interface AccessInfo {
  has_access: boolean;
  pricing_type: string;
  price: string | null;
  currency: string | null;
  access_reason: string | null;
  unlock_methods: string[] | null;
  /** When the open way closes (or, with no access, when the last one closed). */
  access_ends_at: string | null;
  /** When the viewer's soonest way opens, while it is not open yet. */
  opens_at: string | null;
}

export interface BundleItem {
  id: number;
  content_type: number;
  object_id: number;
  content_type_name: string;
}

export interface Bundle {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  thumbnail_url: string;
  is_active: boolean;
  /** False: a draft (focus mode makes these), hidden from students until published. */
  is_published?: boolean;
  item_count: number;
  access_info: AccessInfo;
  items?: BundleItem[];
  original_price?: string;
  created_at: string;
  updated_at: string;
}

export interface StoreItem {
  id: number;
  title: string;
  description: string;
  type:
    | "course"
    | "download"
    | "live_class"
    | "live_stream"
    | "onsite_event"
    | "bundle";
  price: string;
  currency: string;
  thumbnail_url: string;
  /** The kept cover design of a course or event, drawn live in place of the photo. */
  cover_design?: CoverDesign | null;
  /** What that cover's badge reads: a course's creation ("New"), an event's start (its date). */
  created_at?: string | null;
  scheduled_at?: string | null;
  is_active: boolean;
  item_count: number;
  original_price: string | null;
  access_info: AccessInfo;
}

export interface CartItem {
  content_type: string;
  object_id: number;
  title: string;
  price: string;
  currency?: string;
  type: string;
  /** Its cover photo, shown beside the payment form. */
  image?: string;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  billing_interval_months?: number;
  item_count?: number;
  is_subscribed?: boolean;
}

export interface PlanAccessItem {
  type: string;
  id: number;
  title: string;
  slug?: string;
  thumbnail_url?: string;
  /** The kept cover design of a course or event, drawn live in place of the photo. */
  cover_design?: CoverDesign | null;
  /** What that cover's badge reads: a course's creation ("New"), an event's start (its date). */
  created_at?: string | null;
  scheduled_at?: string | null;
}

export interface SubscriptionPlanDetail extends SubscriptionPlan {
  items: PlanAccessItem[];
  is_subscribed?: boolean;
}
