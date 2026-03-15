'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import type { Course } from '@/types/course'

interface CourseCardProps {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <Link href={`/courses/${course.slug}`}>
      <Card className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
        {course.thumbnail_url ? (
          <div className="relative overflow-hidden">
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <span className="text-5xl font-bold text-primary/30">
              {course.title.charAt(0)}
            </span>
          </div>
        )}
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug line-clamp-2">{course.title}</h3>
            <Badge variant={course.pricing_type === 'free' ? 'success' : 'default'} className="shrink-0">
              {course.pricing_type === 'free'
                ? 'Free'
                : course.pricing_type === 'paid'
                  ? `$${course.price}`
                  : 'Subscription'}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{course.instructor_name}</span>
            {course.lesson_count !== undefined && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {course.lesson_count} lesson{course.lesson_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
