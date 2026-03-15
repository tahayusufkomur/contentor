'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clientFetch } from '@/lib/api-client'
import type { Course } from '@/types/course'

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    clientFetch<Course[]>('/api/v1/courses/')
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link href="/admin/courses/new">
          <Button>New Course</Button>
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Courses</CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-muted-foreground">No courses yet. Create your first course.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Pricing</th>
                  <th className="pb-3 font-medium">Lessons</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b">
                    <td className="py-3">{course.title}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                          course.is_published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {course.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-3 capitalize">{course.pricing_type}</td>
                    <td className="py-3">{course.lesson_count ?? 0}</td>
                    <td className="py-3">
                      <Link href={`/admin/courses/${course.slug}`}>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </Link>
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
