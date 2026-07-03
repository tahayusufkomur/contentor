import type { AccessInfo } from './billing'
import type { Tag } from './course'

export interface DownloadFile {
  id: number
  title: string
  file_url: string
  file_size: number
  download_count: number
  pricing_type: 'free' | 'paid' | 'subscription'
  price: string
  tags?: Tag[]
  tag_ids?: number[]
  created_at: string
  access_info?: AccessInfo
}
