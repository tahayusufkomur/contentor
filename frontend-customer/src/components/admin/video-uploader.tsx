'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { clientFetch } from '@/lib/api-client'
import { Upload, Video, AlertCircle } from 'lucide-react'

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
      {/* Current video preview */}
      {currentVideoUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Current Video</p>
            <Badge variant="success">Uploaded</Badge>
          </div>
          <video
            src={currentVideoUrl}
            controls
            className="w-full max-w-md rounded-lg border shadow-sm"
          />
        </div>
      )}

      {/* Upload area */}
      <div className="rounded-lg border-2 border-dashed bg-muted/30 p-6 text-center">
        <Video className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm font-medium">
          {currentVideoUrl ? 'Replace video' : 'Upload a video'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          MP4, MOV, or WebM
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="video-upload"
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3 gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          Choose File
        </Button>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
