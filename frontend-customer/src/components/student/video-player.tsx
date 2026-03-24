'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { clientFetch } from '@/lib/api-client'
import { CheckCircle2, PlayCircle } from 'lucide-react'
import type { Lesson, Progress } from '@/types/course'

interface VideoPlayerProps {
  courseSlug: string
  lesson: Lesson
  progress: Progress | null
  onProgressUpdate: () => void
  onLessonComplete?: () => void
}

export function VideoPlayer({ courseSlug, lesson, progress, onProgressUpdate, onLessonComplete }: VideoPlayerProps) {
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

    const handleEnded = () => {
      if (!progress?.completed) {
        reportProgress(video.duration || lesson.duration_seconds, true)
      }
      onLessonComplete?.()
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
    }
  }, [lesson.id, lesson.duration_seconds, reportProgress, progress?.completed, onLessonComplete])

  async function handleMarkComplete() {
    await reportProgress(progress?.watched_seconds ?? 0, true)
    onLessonComplete?.()
  }

  if (!lesson.video_signed_url) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted">
        <div className="text-center">
          <PlayCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No video available for this lesson.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <video
        ref={videoRef}
        src={lesson.video_signed_url}
        controls
        className="aspect-video w-full bg-black"
      />
      <div className="flex items-center justify-between border-t px-4 py-3">
        {progress?.completed ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        ) : (
          <Button variant="outline" size="sm" onClick={handleMarkComplete} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Mark as Complete
          </Button>
        )}
      </div>
    </div>
  )
}
