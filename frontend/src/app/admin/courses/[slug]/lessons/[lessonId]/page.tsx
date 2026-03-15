'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientFetch } from '@/lib/api-client'
import { VideoUploader } from '@/components/admin/video-uploader'
import type { Lesson } from '@/types/course'

export default function AdminLessonEditPage() {
  const params = useParams<{ slug: string; lessonId: string }>()
  const router = useRouter()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadLesson()
  }, [params.slug, params.lessonId])

  function loadLesson() {
    clientFetch<Lesson>(`/api/v1/courses/${params.slug}/lessons/${params.lessonId}/`)
      .then(setLesson)
      .catch(console.error)
  }

  async function handleSave() {
    if (!lesson) return
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${params.slug}/lessons/${params.lessonId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: lesson.title,
          content_html: lesson.content_html,
          is_free_preview: lesson.is_free_preview,
        }),
      })
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (!lesson) return <p>Loading...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Lesson</h1>

      <Card>
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Content (HTML)</Label>
            <textarea
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={lesson.content_html}
              onChange={(e) => setLesson({ ...lesson, content_html: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_free_preview"
              checked={lesson.is_free_preview}
              onChange={(e) => setLesson({ ...lesson, is_free_preview: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="is_free_preview">Free Preview</Label>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoUploader
            courseSlug={params.slug}
            lessonId={Number(params.lessonId)}
            currentVideoUrl={lesson.video_signed_url}
            onUploadComplete={loadLesson}
          />
        </CardContent>
      </Card>
    </div>
  )
}
