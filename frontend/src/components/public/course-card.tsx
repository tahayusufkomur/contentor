'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import type { Course } from '@/types/course'

interface CourseCardProps {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <Link href={`/courses/${course.slug}`}>
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
          <p className="mb-2 text-sm text-muted-foreground">{course.instructor_name}</p>
          <div className="flex items-center justify-between">
            <span
              className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                course.pricing_type === 'free'
                  ? 'bg-green-100 text-green-800'
                  : course.pricing_type === 'paid'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-purple-100 text-purple-800'
              }`}
            >
              {course.pricing_type === 'free' ? 'Free' : course.pricing_type === 'paid' ? `$${course.price}` : 'Subscription'}
            </span>
            {course.lesson_count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {course.lesson_count} lesson{course.lesson_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
