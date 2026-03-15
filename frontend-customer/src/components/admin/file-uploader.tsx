'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
import { AlertCircle, FileUp, Upload } from 'lucide-react'

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
      {/* Selected file info */}
      {fileName && fileSize !== null && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <FileUp className="h-4 w-4" />
          <span>
            {fileName} ({formatFileSize(fileSize)})
          </span>
        </div>
      )}

      {/* Upload area */}
      <div className="rounded-lg border-2 border-dashed bg-muted/30 p-6 text-center">
        <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm font-medium">Choose a file</p>
        <p className="mt-1 text-xs text-muted-foreground">Any file type</p>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="file-upload"
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3 gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          Browse
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
