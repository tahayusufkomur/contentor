export const dynamic = 'force-dynamic'

import { serverFetch } from '@/lib/api-server'
import { EnrollButton } from '@/components/public/enroll-button'
import type { CourseDetail, Module } from '@/types/course'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let course: CourseDetail | null = null
  try {
    course = await serverFetch<CourseDetail>(`/api/v1/courses/${slug}/`)
  } catch {
    course = null
  }

  if (!course) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">Course not found</h1>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          {course.thumbnail_url ? (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="mb-6 h-64 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="mb-6 flex h-64 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
              <span className="text-6xl font-bold text-primary/30">
                {course.title.charAt(0)}
              </span>
            </div>
          )}
          <h1 className="mb-2 text-3xl font-bold">{course.title}</h1>
          <p className="mb-4 text-muted-foreground">By {course.instructor_name}</p>
          <p className="mb-6 text-lg">{course.description}</p>
        </div>
        <div>
          <div className="sticky top-6 rounded-lg border bg-card p-6 shadow-sm">
            <p className="mb-2 text-3xl font-bold">
              {course.pricing_type === 'free' ? 'Free' : `$${course.price}`}
            </p>
            <EnrollButton course={course} />
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>{course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} lessons</p>
              <p>{course.modules.length} modules</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Curriculum</h2>
        <div className="space-y-4">
          {course.modules.map((mod: Module) => (
            <div key={mod.id} className="rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-3">
                <h3 className="font-semibold">
                  Module {mod.order}: {mod.title}
                </h3>
              </div>
              <div className="divide-y">
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{lesson.title}</span>
                      {lesson.is_free_preview && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Free Preview
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
