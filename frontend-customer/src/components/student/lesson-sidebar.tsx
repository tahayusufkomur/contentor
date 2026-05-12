'use client'

import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/format'
import { CheckCircle2, Circle, Clock, ListRestart } from 'lucide-react'
import type { CourseDetail, Lesson, Progress } from '@/types/course'

interface LessonSidebarProps {
  course: CourseDetail
  currentLessonId: number
  progressMap: Record<number, Progress>
  onLessonSelect: (lesson: Lesson) => void
  autoPlay?: boolean
  onAutoPlayChange?: (autoPlay: boolean) => void
}

export function LessonSidebar({ course, currentLessonId, progressMap, onLessonSelect, autoPlay, onAutoPlayChange }: LessonSidebarProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{course.title}</h3>
            <p className="text-xs text-muted-foreground">
              {course.modules.reduce((a, m) => a + m.lessons.length, 0)} lessons
            </p>
          </div>
          {onAutoPlayChange && (
            <button
              onClick={() => onAutoPlayChange(!autoPlay)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                autoPlay
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
              title={autoPlay ? "Auto-play is on" : "Auto-play is off"}
            >
              <ListRestart className="h-3 w-3" />
              Auto
            </button>
          )}
        </div>
      </div>
      <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
        {course.modules.map((mod) => (
          <div key={mod.id}>
            <div className="bg-muted/40 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Module {mod.order}: {mod.title}
              </p>
            </div>
            <div className="divide-y">
              {mod.lessons.map((lesson) => {
                const isActive = lesson.id === currentLessonId
                const isCompleted = progressMap[lesson.id]?.completed

                return (
                  <div
                    key={lesson.id}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 cursor-pointer',
                      isActive && 'bg-primary/10 border-l-2 border-primary font-medium',
                    )}
                    onClick={() => onLessonSelect(lesson)}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </span>
                    <span className="flex-1 truncate">{lesson.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
