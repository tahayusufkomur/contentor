'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'
import type { Course } from '@/types/course'
import { PriceBadge } from '@/components/billing/price-badge'

export type CourseCardVariant = 'elevated' | 'bordered' | 'minimal' | 'overlay'

interface CourseCardProps {
  course: Course
  variant?: CourseCardVariant
  showPrice?: boolean
  showMeta?: boolean
}

const stackedWrapper: Record<Exclude<CourseCardVariant, 'overlay'>, string> = {
  elevated:
    'group overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
  bordered: 'group overflow-hidden transition-colors hover:border-primary/40',
  minimal: 'group overflow-hidden rounded-xl border-0 bg-transparent shadow-none',
}

export function CourseCard({
  course,
  variant = 'elevated',
  showPrice = true,
  showMeta = true,
}: CourseCardProps) {
  const thumb = course.thumbnail_url ? (
    <img
      src={course.thumbnail_signed_url || course.thumbnail_url}
      alt={course.title}
      className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  ) : (
    <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10">
      <span className="text-5xl font-bold text-primary/30">
        {course.title.charAt(0)}
      </span>
    </div>
  )

  const meta = showMeta ? (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{course.instructor_name}</span>
      {course.lesson_count !== undefined && (
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {course.lesson_count} lesson{course.lesson_count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  ) : null

  const price = showPrice ? (
    <PriceBadge
      accessInfo={course.access_info}
      price={course.price}
      pricingType={course.pricing_type}
    />
  ) : null

  if (variant === 'overlay') {
    return (
      <Link href={`/courses/${course.slug}`} className="group block">
        <div className="relative overflow-hidden rounded-xl">
          <div className="relative overflow-hidden">{thumb}</div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug line-clamp-2 text-foreground">
                {course.title}
              </h3>
              {price}
            </div>
          </div>
        </div>
        {meta && <div className="px-1 pt-3">{meta}</div>}
      </Link>
    )
  }

  return (
    <Link href={`/courses/${course.slug}`}>
      <Card
        className={stackedWrapper[variant as Exclude<CourseCardVariant, 'overlay'>]}
      >
        <div className="relative overflow-hidden">{thumb}</div>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug line-clamp-2">{course.title}</h3>
            {price}
          </div>
          {meta}
        </CardContent>
      </Card>
    </Link>
  )
}
