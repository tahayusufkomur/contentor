'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { clientFetch } from '@/lib/api-client'
import { ArrowLeft, BookOpen, Pencil, Plus } from 'lucide-react'
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
          thumbnail_url: course.thumbnail_url,
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

  if (!course) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
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
          <Link href="/admin/courses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Edit Course</h1>
          <p className="text-sm text-muted-foreground">{course.title}</p>
        </div>
        <Badge variant={course.is_published ? 'success' : 'secondary'}>
          {course.is_published ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Course Details</CardTitle>
              <CardDescription>Update the basic information for this course.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={course.title}
                  onChange={(e) => setCourse({ ...course, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={course.description}
                  onChange={(e) => setCourse({ ...course, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
                <Input
                  id="thumbnail_url"
                  placeholder="https://..."
                  value={course.thumbnail_url || ''}
                  onChange={(e) => setCourse({ ...course, thumbnail_url: e.target.value })}
                />
                {course.thumbnail_url && (
                  <img
                    src={course.thumbnail_url}
                    alt="Thumbnail preview"
                    className="mt-2 h-32 w-auto rounded-md object-cover"
                  />
                )}
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Curriculum Tab */}
        <TabsContent value="curriculum">
          <div className="space-y-4">
            {course.modules.map((mod: Module) => (
              <Card key={mod.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Module {mod.order}: {mod.title}
                    </CardTitle>
                    <Badge variant="secondary">
                      {mod.lessons.length} lesson{mod.lessons.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mod.lessons.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Video</TableHead>
                          <TableHead className="w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mod.lessons.map((lesson) => (
                          <TableRow key={lesson.id}>
                            <TableCell className="font-medium">{lesson.title}</TableCell>
                            <TableCell>{formatDuration(lesson.duration_seconds)}</TableCell>
                            <TableCell>
                              <Badge variant={lesson.video_url ? 'success' : 'secondary'}>
                                {lesson.video_url ? 'Uploaded' : 'No video'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button asChild variant="ghost" size="icon">
                                <Link href={`/admin/courses/${params.slug}/lessons/${lesson.id}`}>
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No lessons yet.</p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New lesson title"
                      value={newLessonTitles[mod.id] || ''}
                      onChange={(e) =>
                        setNewLessonTitles((prev) => ({ ...prev, [mod.id]: e.target.value }))
                      }
                    />
                    <Button variant="outline" className="gap-2 shrink-0" onClick={() => handleAddLesson(mod.id)}>
                      <Plus className="h-4 w-4" />
                      Add Lesson
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="New module title"
                    value={newModuleTitle}
                    onChange={(e) => setNewModuleTitle(e.target.value)}
                  />
                  <Button className="gap-2 shrink-0" onClick={handleAddModule}>
                    <Plus className="h-4 w-4" />
                    Add Module
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Course Settings</CardTitle>
              <CardDescription>Configure pricing and publishing options.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pricing_type">Pricing Type</Label>
                  <select
                    id="pricing_type"
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
                  <Label htmlFor="settings_price">Price</Label>
                  <Input
                    id="settings_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={course.price}
                    onChange={(e) => setCourse({ ...course, price: e.target.value })}
                    disabled={course.pricing_type === 'free'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="settings_published"
                  checked={course.is_published}
                  onCheckedChange={(checked) => setCourse({ ...course, is_published: checked })}
                />
                <Label htmlFor="settings_published">Published</Label>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
