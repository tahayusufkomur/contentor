export interface Lesson {
  id: number
  title: string
  order: number
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
  thumbnail_signed_url?: string
  price: string
  pricing_type: 'free' | 'paid' | 'subscription'
  is_published: boolean
  order: number
  lesson_count?: number
  enrolled_count?: number
  created_at?: string
  updated_at?: string
}

export interface CourseDetail extends Course {
  modules: Module[]
  is_enrolled: boolean
}

export interface Progress {
  id: number
  lesson: number
  completed: boolean
  watched_seconds: number
  updated_at: string
}
