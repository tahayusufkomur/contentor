"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { Search, Upload, Video, X } from "lucide-react"
import { formatDuration } from "@/lib/format"

interface VideoItem {
  id: number
  title: string
  duration_seconds: number
  video_signed_url: string | null
}

interface PresignResponse {
  upload_url: string
  s3_key: string
}

interface VideoPickerProps {
  value: number | null
  previewUrl: string | null
  onChange: (videoId: number | null, signedUrl: string | null) => void
  allowUrl?: boolean
}

function extractDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(Math.round(video.duration))
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(0)
    }
    video.src = URL.createObjectURL(file)
  })
}

export function VideoPicker({ value, previewUrl, onChange, allowUrl = false }: VideoPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "20", offset: "0" })
      if (search) params.set("search", search)
      const res = await clientFetch<{ results: VideoItem[]; next: string | null }>(
        `/api/v1/courses/videos/?${params}`
      )
      setVideos(res.results)
    } catch {
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(fetchVideos, 300)
    return () => clearTimeout(timer)
  }, [open, fetchVideos])

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      const duration_seconds = await extractDuration(file)
      const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")

      const videoData = await clientFetch<VideoItem>("/api/v1/courses/videos/", {
        method: "POST",
        body: JSON.stringify({ title, description: "" }),
      })

      const { upload_url, s3_key } = await clientFetch<PresignResponse>(
        "/api/v1/upload/presign/",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category: "library",
          }),
        }
      )

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", upload_url)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(file)
      })

      await clientFetch("/api/v1/upload/complete/", {
        method: "POST",
        body: JSON.stringify({
          s3_key,
          category: "library",
          video_id: videoData.id,
          duration_seconds,
          file_size: file.size,
        }),
      })

      const updated = await clientFetch<VideoItem>(
        `/api/v1/courses/videos/${videoData.id}/`
      )
      onChange(updated.id, updated.video_signed_url)
      setOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <video
            src={previewUrl}
            className="h-16 w-24 rounded-md border object-cover"
            preload="metadata"
          />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-md border bg-muted">
            <Video className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            Choose video
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null, null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {allowUrl && (
        <Input
          value={value == null ? (previewUrl ?? "") : ""}
          onChange={(e) => onChange(null, e.target.value || null)}
          placeholder="YouTube, Vimeo, or direct video URL"
          className="text-sm"
        />
      )}

      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : videos.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {search ? "No videos match your search." : "No videos yet."}
            </p>
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => {
                    onChange(video.id, video.video_signed_url)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{video.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(video.duration_seconds)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
