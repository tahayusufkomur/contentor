export const dynamic = 'force-dynamic'

import { serverFetch } from '@/lib/api-server'
import { CourseCard } from '@/components/public/course-card'
import type { Course } from '@/types/course'

export default async function CoursesPage() {
  let courses: Course[] = []
  try {
    courses = await serverFetch<Course[]>('/api/v1/courses/')
  } catch {
    courses = []
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Courses</h1>
      {courses.length === 0 ? (
        <p className="text-muted-foreground">No courses available yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  )
}
