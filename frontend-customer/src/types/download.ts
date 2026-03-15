export interface DownloadFile {
  id: number
  title: string
  file_url: string
  file_size: number
  download_count: number
  access_type: 'free' | 'paid' | 'subscription'
  created_at: string
}
