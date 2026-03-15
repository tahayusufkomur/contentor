'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientFetch } from '@/lib/api-client'
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

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Upload File'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload New File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Access Type</Label>
              <select
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
            <div className="space-y-2">
              <Label>File</Label>
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading || !form.title.trim()}
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Files</CardTitle>
        </CardHeader>
        <CardContent>
          {downloads.length === 0 ? (
            <p className="text-muted-foreground">No files uploaded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Size</th>
                  <th className="pb-3 font-medium">Downloads</th>
                  <th className="pb-3 font-medium">Access</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {downloads.map((dl) => (
                  <tr key={dl.id} className="border-b">
                    <td className="py-3">{dl.title}</td>
                    <td className="py-3">{formatFileSize(dl.file_size)}</td>
                    <td className="py-3">{dl.download_count}</td>
                    <td className="py-3 capitalize">{dl.access_type}</td>
                    <td className="py-3">
                      {dl.file_url && (
                        <a href={dl.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            Download
                          </Button>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
