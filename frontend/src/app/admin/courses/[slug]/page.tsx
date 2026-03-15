'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientFetch } from '@/lib/api-client'
import type { CourseDetail, Module } from '@/types/course'

export default function AdminCourseDetailPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [newLessonTitles, setNewLessonTitles] = useState<Record<number, string>>({})

  useEffect(() => {
    loadCourse()
  }, [params.slug])

  function loadCourse() {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then(setCourse)
      .catch(console.error)
  }

  async function handleSave() {
    if (!course) return
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${params.slug}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: course.title,
          description: course.description,
          pricing_type: course.pricing_type,
          price: course.price,
          is_published: course.is_published,
        }),
      })
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddModule() {
    if (!newModuleTitle.trim()) return
    try {
      await clientFetch(`/api/v1/courses/${params.slug}/modules/`, {
        method: 'POST',
        body: JSON.stringify({ title: newModuleTitle }),
      })
      setNewModuleTitle('')
      loadCourse()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleAddLesson(moduleId: number) {
    const title = newLessonTitles[moduleId]
    if (!title?.trim()) return
    try {
      await clientFetch(`/api/v1/courses/${params.slug}/modules/${moduleId}/lessons/`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      setNewLessonTitles((prev) => ({ ...prev, [moduleId]: '' }))
      loadCourse()
    } catch (err) {
      console.error(err)
    }
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (!course) return <p>Loading...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Course</h1>

      <Card>
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={course.title}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={course.description}
              onChange={(e) => setCourse({ ...course, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pricing Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={course.pricing_type}
                onChange={(e) =>
                  setCourse({ ...course, pricing_type: e.target.value as 'free' | 'paid' | 'subscription' })
                }
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Price</Label>
              <Input
                type="number"
                step="0.01"
                value={course.price}
                onChange={(e) => setCourse({ ...course, price: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_published"
              checked={course.is_published}
              onChange={(e) => setCourse({ ...course, is_published: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="is_published">Published</Label>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules &amp; Lessons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {course.modules.map((mod: Module) => (
            <div key={mod.id} className="rounded-md border p-4">
              <h3 className="mb-3 text-lg font-semibold">
                Module {mod.order}: {mod.title}
              </h3>
              {mod.lessons.length > 0 ? (
                <table className="mb-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Title</th>
                      <th className="pb-2 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Video</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mod.lessons.map((lesson) => (
                      <tr key={lesson.id} className="border-b">
                        <td className="py-2">{lesson.title}</td>
                        <td className="py-2">{formatDuration(lesson.duration_seconds)}</td>
                        <td className="py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                              lesson.video_url
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {lesson.video_url ? 'Uploaded' : 'No video'}
                          </span>
                        </td>
                        <td className="py-2">
                          <Link href={`/admin/courses/${params.slug}/lessons/${lesson.id}`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mb-3 text-sm text-muted-foreground">No lessons yet.</p>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="New lesson title"
                  value={newLessonTitles[mod.id] || ''}
                  onChange={(e) =>
                    setNewLessonTitles((prev) => ({ ...prev, [mod.id]: e.target.value }))
                  }
                />
                <Button variant="outline" onClick={() => handleAddLesson(mod.id)}>
                  Add Lesson
                </Button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              placeholder="New module title"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
            />
            <Button onClick={handleAddModule}>Add Module</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
