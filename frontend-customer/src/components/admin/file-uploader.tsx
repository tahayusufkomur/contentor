'use client'

import { useState, useRef } from 'react'
import { clientFetch } from '@/lib/api-client'

interface FileUploaderProps {
  downloadId: number
  onUploadComplete: () => void
}

interface PresignResponse {
  upload_url: string
  s3_key: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function FileUploader({ downloadId, onUploadComplete }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setFileSize(file.size)
    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      const { upload_url, s3_key } = await clientFetch<PresignResponse>('/api/v1/upload/presign/', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: 'download',
          download_id: downloadId,
        }),
      })

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed with status ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })

      await clientFetch('/api/v1/upload/complete/', {
        method: 'POST',
        body: JSON.stringify({ s3_key, category: 'download', download_id: downloadId }),
      })

      onUploadComplete()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {fileName && fileSize !== null && (
        <p className="text-sm text-muted-foreground">
          {fileName} ({formatFileSize(fileSize)})
        </p>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
          className="text-sm"
        />
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
