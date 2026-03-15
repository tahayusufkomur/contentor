'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
import type { Lesson, Progress } from '@/types/course'

interface VideoPlayerProps {
  courseSlug: string
  lesson: Lesson
  progress: Progress | null
  onProgressUpdate: () => void
}

export function VideoPlayer({ courseSlug, lesson, progress, onProgressUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastReportedRef = useRef(0)

  const reportProgress = useCallback(
    async (watchedSeconds: number, completed: boolean) => {
      try {
        await clientFetch(`/api/v1/courses/${courseSlug}/progress/`, {
          method: 'POST',
          body: JSON.stringify({
            lesson: lesson.id,
            watched_seconds: Math.round(watchedSeconds),
            completed,
          }),
        })
        onProgressUpdate()
      } catch (err) {
        console.error(err)
      }
    },
    [courseSlug, lesson.id, onProgressUpdate],
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    lastReportedRef.current = 0

    const handleTimeUpdate = () => {
      const now = video.currentTime
      if (now - lastReportedRef.current >= 10) {
        lastReportedRef.current = now
        const isComplete = lesson.duration_seconds > 0 && now / lesson.duration_seconds >= 0.9
        reportProgress(now, isComplete)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [lesson.id, lesson.duration_seconds, reportProgress])

  async function handleMarkComplete() {
    await reportProgress(progress?.watched_seconds ?? 0, true)
  }

  if (!lesson.video_signed_url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">No video available for this lesson.</p>
      </div>
    )
  }

  return (
    <div>
      <video
        ref={videoRef}
        src={lesson.video_signed_url}
        controls
        className="w-full rounded-lg"
      />
      {!progress?.completed && (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={handleMarkComplete}>
            Mark as Complete
          </Button>
        </div>
      )}
    </div>
  )
}
