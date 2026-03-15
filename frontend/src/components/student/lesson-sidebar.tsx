'use client'

import { cn } from '@/lib/utils'
import type { CourseDetail, Lesson, Progress } from '@/types/course'

interface LessonSidebarProps {
  course: CourseDetail
  currentLessonId: number
  progressMap: Record<number, Progress>
  onLessonSelect: (lesson: Lesson) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LessonSidebar({ course, currentLessonId, progressMap, onLessonSelect }: LessonSidebarProps) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold">{course.title}</h3>
      </div>
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {course.modules.map((mod) => (
          <div key={mod.id}>
            <div className="bg-muted/30 px-4 py-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Module {mod.order}: {mod.title}
              </p>
            </div>
            <div className="divide-y">
              {mod.lessons.map((lesson) => {
                const isActive = lesson.id === currentLessonId
                const isCompleted = progressMap[lesson.id]?.completed

                return (
                  <button
                    key={lesson.id}
                    onClick={() => onLessonSelect(lesson)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50',
                      isActive && 'bg-primary/10 font-medium',
                    )}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {isCompleted ? (
                        <svg
                          className="h-5 w-5 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                      )}
                    </span>
                    <span className="flex-1">{lesson.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
