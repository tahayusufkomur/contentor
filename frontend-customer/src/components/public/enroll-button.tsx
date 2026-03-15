'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
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
      <Button className="w-full" onClick={() => router.push(`/learn/${course.slug}`)}>
        Continue Learning
      </Button>
    )
  }

  if (course.pricing_type === 'free') {
    return (
      <Button className="w-full" onClick={handleEnroll} disabled={enrolling}>
        {enrolling ? 'Enrolling...' : 'Enroll for Free'}
      </Button>
    )
  }

  return (
    <Button className="w-full" disabled>
      Coming soon
    </Button>
  )
}
