'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { clientFetch } from '@/lib/api-client'
import { VideoUploader } from '@/components/admin/video-uploader'
import { ArrowLeft, Video } from 'lucide-react'
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

  if (!lesson) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/courses/${params.slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Lesson</h1>
          <p className="text-sm text-muted-foreground">{lesson.title}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
          <CardDescription>Update the lesson content and settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lesson_title">Title</Label>
            <Input
              id="lesson_title"
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_html">Content (HTML)</Label>
            <textarea
              id="content_html"
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={lesson.content_html}
              onChange={(e) => setLesson({ ...lesson, content_html: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="is_free_preview"
              checked={lesson.is_free_preview}
              onCheckedChange={(checked) =>
                setLesson({ ...lesson, is_free_preview: checked })
              }
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
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video
          </CardTitle>
          <CardDescription>
            Upload or replace the lesson video. Supported formats: MP4, MOV, WebM.
          </CardDescription>
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
