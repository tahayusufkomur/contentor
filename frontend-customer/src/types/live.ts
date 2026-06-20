import type { AccessInfo } from './billing'

export interface LiveClass {
  id: number
  title: string
  description: string
  instructor: number
  status: string
  pricing_type: 'free' | 'paid'
  price: string
  thumbnail_url: string
  thumbnail_signed_url: string | null
  recording_url: string | null
  recording_signed_url: string | null
  auto_recording: boolean
  room_name: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  access_info?: AccessInfo
  filter_options?: import('./course').FilterOption[]
  filter_option_ids?: number[]
  tags?: import('./course').Tag[]
  tag_ids?: number[]
}

export interface LiveStream {
  id: number
  title: string
  description: string
  instructor: number
  status: string
  pricing_type: 'free' | 'paid'
  price: string
  thumbnail_url: string
  thumbnail_signed_url: string | null
  recording_url: string | null
  recording_signed_url: string | null
  auto_recording: boolean
  room_name: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  access_info?: AccessInfo
  filter_options?: import('./course').FilterOption[]
  filter_option_ids?: number[]
  tags?: import('./course').Tag[]
  tag_ids?: number[]
}

export interface ZoomClass {
  id: number
  title: string
  description: string
  instructor: number
  status: string
  zoom_link: string
  zoom_meeting_id: string
  pricing_type: 'free' | 'paid'
  price: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  filter_options?: import('./course').FilterOption[]
  filter_option_ids?: number[]
  tags?: import('./course').Tag[]
  tag_ids?: number[]
}

export interface OnsiteEvent {
  id: number
  title: string
  description: string
  instructor: number
  status: string
  location: string
  address: string
  max_capacity: number | null
  pricing_type: 'free' | 'paid'
  price: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  filter_options?: import('./course').FilterOption[]
  filter_option_ids?: number[]
  tags?: import('./course').Tag[]
  tag_ids?: number[]
}

export type CalendarEventType = 'live_class' | 'live_stream' | 'onsite_event'

export interface CalendarEvent {
  id: number
  type: CalendarEventType
  title: string
  description: string
  status: string
  pricing_type: 'free' | 'paid'
  price: string
  scheduled_at: string
  started_at: string | null
  ended_at: string | null
  location: string
  thumbnail_signed_url: string | null
  filter_options?: import('./course').FilterOption[]
}

export interface CalendarEventDetail extends CalendarEvent {
  access_info: AccessInfo
}
