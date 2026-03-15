'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { clientFetch } from '@/lib/api-client'
import { Download, ExternalLink, Plus, Upload, X } from 'lucide-react'
import type { DownloadFile } from '@/types/download'

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

export default function AdminDownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadFile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [form, setForm] = useState({
    title: '',
    access_type: 'free' as 'free' | 'paid' | 'subscription',
  })

  useEffect(() => {
    loadDownloads()
  }, [])

  function loadDownloads() {
    clientFetch<DownloadFile[]>('/api/v1/downloads/')
      .then(setDownloads)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form.title.trim()) return

    setUploading(true)
    setProgress(0)

    try {
      const created = await clientFetch<DownloadFile>('/api/v1/downloads/', {
        method: 'POST',
        body: JSON.stringify({ title: form.title, access_type: form.access_type }),
      })

      const { upload_url, s3_key } = await clientFetch<PresignResponse>('/api/v1/upload/presign/', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: 'download',
          download_id: created.id,
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
        body: JSON.stringify({ s3_key, category: 'download', download_id: created.id }),
      })

      setForm({ title: '', access_type: 'free' })
      setShowForm(false)
      loadDownloads()
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Downloads</h1>
          <p className="text-sm text-muted-foreground">Manage downloadable files for your students.</p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <X className="h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Upload File
            </>
          )}
        </Button>
      </div>

      {/* Upload form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload New File
            </CardTitle>
            <CardDescription>
              Enter a title and select the access type, then choose a file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dl_title">Title</Label>
                <Input
                  id="dl_title"
                  placeholder="e.g. Course Workbook"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dl_access">Access Type</Label>
                <select
                  id="dl_access"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.access_type}
                  onChange={(e) =>
                    setForm({ ...form, access_type: e.target.value as 'free' | 'paid' | 'subscription' })
                  }
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <div className="rounded-lg border-2 border-dashed bg-muted/30 p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a file to upload
                </p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading || !form.title.trim()}
                  className="mt-3 text-sm"
                />
              </div>
            </div>
            {uploading && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{progress}% uploaded</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Downloads table */}
      <Card>
        <CardContent className="p-0">
          {downloads.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No files uploaded"
              description="Upload your first file to make it available to your students."
              action={{ label: 'Upload File', onClick: () => setShowForm(true) }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Downloads</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {downloads.map((dl) => (
                  <TableRow key={dl.id}>
                    <TableCell className="font-medium">{dl.title}</TableCell>
                    <TableCell>{formatFileSize(dl.file_size)}</TableCell>
                    <TableCell>{dl.download_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          dl.access_type === 'free'
                            ? 'success'
                            : dl.access_type === 'paid'
                              ? 'default'
                              : 'warning'
                        }
                      >
                        {dl.access_type === 'free'
                          ? 'Free'
                          : dl.access_type === 'paid'
                            ? 'Paid'
                            : 'Subscription'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {dl.file_url && (
                        <Button asChild variant="ghost" size="icon">
                          <a href={dl.file_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">Download</span>
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
