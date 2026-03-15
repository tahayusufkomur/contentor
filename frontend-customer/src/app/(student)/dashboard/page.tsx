'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { clientFetch } from '@/lib/api-client'
import type { Course } from '@/types/course'

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    clientFetch<Course[]>('/api/v1/courses/enrolled/')
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Courses</h1>
      {courses.length === 0 ? (
        <p className="text-muted-foreground">
          You have not enrolled in any courses yet.{' '}
          <Link href="/courses" className="text-primary underline">
            Browse courses
          </Link>
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link key={course.id} href={`/learn/${course.slug}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                {course.thumbnail_url ? (
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <span className="text-4xl font-bold text-primary/30">
                      {course.title.charAt(0)}
                    </span>
                  </div>
                )}
                <CardContent className="p-4">
                  <h3 className="mb-1 font-semibold">{course.title}</h3>
                  <p className="text-sm text-muted-foreground">{course.instructor_name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
