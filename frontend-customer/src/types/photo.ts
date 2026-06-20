import type { Tag } from './course'

export interface Photo {
  id: string
  s3_key: string
  alt_text: string
  title: string
  content_type: string
  file_size: number
  width: number | null
  height: number | null
  signed_url: string | null
  tags?: Tag[]
  created_at: string
}
