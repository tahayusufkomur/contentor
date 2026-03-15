'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { clientFetch } from '@/lib/api-client'
import { VideoPlayer } from '@/components/student/video-player'
import { LessonSidebar } from '@/components/student/lesson-sidebar'
import type { CourseDetail, Lesson, Progress } from '@/types/course'

export default function LearnPage() {
  const params = useParams<{ slug: string }>()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null)
  const [progressMap, setProgressMap] = useState<Record<number, Progress>>({})

  useEffect(() => {
    loadCourse()
    loadProgress()
  }, [params.slug])

  function loadCourse() {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then((data) => {
        setCourse(data)
        if (!currentLesson && data.modules.length > 0 && data.modules[0].lessons.length > 0) {
          setCurrentLesson(data.modules[0].lessons[0])
        }
      })
      .catch(console.error)
  }

  function loadProgress() {
    clientFetch<Progress[]>(`/api/v1/courses/${params.slug}/progress/`)
      .then((items) => {
        const map: Record<number, Progress> = {}
        items.forEach((p) => { map[p.lesson] = p })
        setProgressMap(map)
      })
      .catch(console.error)
  }

  function handleLessonSelect(lesson: Lesson) {
    setCurrentLesson(lesson)
  }

  function handleProgressUpdate() {
    loadProgress()
  }

  if (!course || !currentLesson) return <p>Loading...</p>

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <VideoPlayer
          courseSlug={params.slug}
          lesson={currentLesson}
          progress={progressMap[currentLesson.id] || null}
          onProgressUpdate={handleProgressUpdate}
        />
        <div className="mt-6">
          <h1 className="mb-2 text-2xl font-bold">{currentLesson.title}</h1>
          {currentLesson.content_html && (
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: currentLesson.content_html }}
            />
          )}
        </div>
      </div>
      <div className="w-80 shrink-0">
        <LessonSidebar
          course={course}
          currentLessonId={currentLesson.id}
          progressMap={progressMap}
          onLessonSelect={handleLessonSelect}
        />
      </div>
    </div>
  )
}
