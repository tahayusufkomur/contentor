import type { AccessInfo } from './billing'

export interface Lesson {
  id: number
  title: string
  order: number
  video_id: number | null
  video_url: string
  video_signed_url: string | null
  duration_seconds: number
  content_html: string
  is_free_preview: boolean
}

export interface Module {
  id: number
  title: string
  order: number
  lessons: Lesson[]
}

export interface Course {
  id: number
  title: string
  slug: string
  description: string
  instructor: number
  instructor_name: string
  thumbnail_url: string
  thumbnail_id?: string | null
  thumbnail_signed_url?: string
  price: string
  pricing_type: 'free' | 'paid'
  is_published: boolean
  order: number
  lesson_count?: number
  enrolled_count?: number
  created_at?: string
  updated_at?: string
  access_info?: AccessInfo
}

export interface UnlockOption {
  price: string
  currency: string
}

export interface UnlockBundleOption {
  id: number
  name: string
  price: string
  currency: string
}

export interface UnlockPlanOption {
  id: number
  name: string
  price: string
  currency: string
  billing_interval_months?: number
}

export interface UnlockOptions {
  purchase?: UnlockOption
  bundles?: UnlockBundleOption[]
  plans?: UnlockPlanOption[]
}

export interface CourseDetail extends Course {
  modules: Module[]
  is_enrolled: boolean
  access_info?: AccessInfo
  unlock_options?: UnlockOptions
}

export interface Progress {
  id: number
  lesson: number
  completed: boolean
  watched_seconds: number
  updated_at: string
}
