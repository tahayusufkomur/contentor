'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
import { Play, Loader2 } from 'lucide-react'
import type { CourseDetail } from '@/types/course'

interface EnrollButtonProps {
  course: CourseDetail
}

export function EnrollButton({ course }: EnrollButtonProps) {
  const router = useRouter()
  const [enrolling, setEnrolling] = useState(false)

  async function handleEnroll() {
    setEnrolling(true)
    try {
      await clientFetch(`/api/v1/courses/${course.slug}/enroll/`, { method: 'POST' })
      router.push(`/learn/${course.slug}`)
    } catch (err) {
      console.error(err)
    } finally {
      setEnrolling(false)
    }
  }

  if (course.is_enrolled) {
    return (
      <Button className="w-full gap-2" onClick={() => router.push(`/learn/${course.slug}`)}>
        <Play className="h-4 w-4" />
        Continue Learning
      </Button>
    )
  }

  if (course.pricing_type === 'free') {
    return (
      <Button className="w-full gap-2" onClick={handleEnroll} disabled={enrolling}>
        {enrolling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enrolling...
          </>
        ) : (
          'Enroll for Free'
        )}
      </Button>
    )
  }

  return (
    <Button className="w-full" disabled>
      Coming soon
    </Button>
  )
}
