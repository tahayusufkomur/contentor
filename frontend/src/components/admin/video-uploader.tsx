'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'

interface VideoUploaderProps {
  courseSlug: string
  lessonId: number
  currentVideoUrl?: string | null
  onUploadComplete: () => void
}

interface PresignResponse {
  upload_url: string
  s3_key: string
}

export function VideoUploader({ courseSlug, lessonId, currentVideoUrl, onUploadComplete }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function extractDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src)
        resolve(Math.round(video.duration))
      }
      video.onerror = () => {
        URL.revokeObjectURL(video.src)
        reject(new Error('Failed to load video metadata'))
      }
      video.src = URL.createObjectURL(file)
    })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      const duration_seconds = await extractDuration(file)

      const { upload_url, s3_key } = await clientFetch<PresignResponse>('/api/v1/upload/presign/', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: 'video',
          course_slug: courseSlug,
          lesson_id: lessonId,
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
        body: JSON.stringify({
          s3_key,
          category: 'video',
          lesson_id: lessonId,
          duration_seconds,
        }),
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
      {currentVideoUrl && (
        <div>
          <p className="mb-2 text-sm font-medium">Current Video</p>
          <video src={currentVideoUrl} controls className="h-48 w-auto rounded-md" />
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
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
