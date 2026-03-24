'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { clientFetch } from '@/lib/api-client'
import { ArrowLeft } from 'lucide-react'
import { CourseForm } from '@/components/admin/course-form'
import type { CourseDetail } from '@/types/course'

export default function AdminCourseDetailPage() {
  const params = useParams<{ slug: string }>()
  const [course, setCourse] = useState<CourseDetail | null>(null)

  useEffect(() => {
    loadCourse()
  }, [params.slug])

  function loadCourse() {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then(setCourse)
      .catch(console.error)
  }

  if (!course) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
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

      <CourseForm course={course} onCourseLoaded={loadCourse} />
    </div>
  )
}
