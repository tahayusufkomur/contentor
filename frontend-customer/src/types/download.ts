import type { AccessInfo } from './billing'

export interface DownloadFile {
  id: number
  title: string
  file_url: string
  file_size: number
  download_count: number
  pricing_type: 'free' | 'paid'
  price: string
  created_at: string
  access_info?: AccessInfo
}
