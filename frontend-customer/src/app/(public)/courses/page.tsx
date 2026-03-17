export const dynamic = 'force-dynamic'

import { serverFetch } from '@/lib/api-server'
import { CourseCard } from '@/components/public/course-card'
import { EmptyState } from '@/components/shared/empty-state'
import { BookOpen } from 'lucide-react'
import type { Course } from '@/types/course'
import { CourseCatalogClient } from '@/components/public/course-catalog-client'

export default async function CoursesPage() {
  let courses: Course[] = []
  try {
    courses = await serverFetch<Course[]>('/api/v1/courses/')
  } catch {
    courses = []
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Browse our collection of courses and start learning today.
        </p>
      </div>

      <CourseCatalogClient courses={courses} />
    </div>
  )
}
