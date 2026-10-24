"use client";

import { Fragment, useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clientFetch } from "@/lib/api-client";
import { CheckCircle2, PlayCircle } from "lucide-react";
import type { Lesson, Progress } from "@/types/course";

interface VideoPlayerProps {
  courseSlug: string;
  lesson: Lesson;
  progress: Progress | null;
  onProgressUpdate: () => void;
  onLessonComplete?: () => void;
}

export function VideoPlayer({
  courseSlug,
  lesson,
  progress,
  onProgressUpdate,
  onLessonComplete,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const lastReportedRef = useRef(0);
  const [cues, setCues] = useState<{ start: number; text: string }[]>([]);

  // The transcript is the captions track's own cues, read once it has loaded.
  useEffect(() => {
    setCues([]);
    const element = trackRef.current;
    if (!element) return;
    const read = () =>
      setCues(
        Array.from(element.track.cues ?? [], (cue) => ({
          start: cue.startTime,
          text: (cue as VTTCue).text,
        })),
      );
    if (element.readyState === HTMLTrackElement.LOADED) read();
    element.addEventListener("load", read);
    return () => element.removeEventListener("load", read);
  }, [lesson.captions_url]);

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play();
  }

  const reportProgress = useCallback(
    async (watchedSeconds: number, completed: boolean) => {
      try {
        await clientFetch(`/api/v1/courses/${courseSlug}/progress/`, {
          method: "POST",
          body: JSON.stringify({
            lesson: lesson.id,
            watched_seconds: Math.round(watchedSeconds),
            completed,
          }),
        });
        onProgressUpdate();
      } catch (err) {
        console.error(err);
      }
    },
    [courseSlug, lesson.id, onProgressUpdate],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    lastReportedRef.current = 0;

    const handleTimeUpdate = () => {
      const now = video.currentTime;
      if (now - lastReportedRef.current >= 10) {
        lastReportedRef.current = now;
        const isComplete =
          lesson.duration_seconds > 0 && now / lesson.duration_seconds >= 0.9;
        reportProgress(now, isComplete);
      }
    };

    const handleEnded = () => {
      if (!progress?.completed) {
        reportProgress(video.duration || lesson.duration_seconds, true);
      }
      onLessonComplete?.();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [
    lesson.id,
    lesson.duration_seconds,
    reportProgress,
    progress?.completed,
    onLessonComplete,
  ]);

  async function handleMarkComplete() {
    await reportProgress(progress?.watched_seconds ?? 0, true);
    onLessonComplete?.();
  }

  if (!lesson.video_signed_url) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted">
        <div className="text-center">
          <PlayCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            No video available for this lesson.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <video
        ref={videoRef}
        src={lesson.video_signed_url}
        controls
        className="aspect-video w-full bg-black"
      >
        {lesson.captions_url && (
          <track
            ref={trackRef}
            kind="captions"
            src={lesson.captions_url}
            srcLang={lesson.captions_language || undefined}
            label={languageName(lesson.captions_language)}
            default
          />
        )}
      </video>
      <div className="flex items-center justify-between border-t px-4 py-3">
        {progress?.completed ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkComplete}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as Complete
          </Button>
        )}
      </div>
      {cues.length > 0 && (
        <details className="border-t px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Transcript
          </summary>
          <p className="mt-3 max-h-72 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
            {cues.map((cue) => (
              <Fragment key={cue.start}>
                <button
                  type="button"
                  onClick={() => seek(cue.start)}
                  className="rounded-sm text-left hover:bg-muted hover:text-foreground"
                >
                  {cue.text}
                </button>{" "}
              </Fragment>
            ))}
          </p>
        </details>
      )}
    </div>
  );
}

/** The language's own name ("Türkçe", "polski"), the same on server and client. */
function languageName(code: string) {
  if (!code) return "Captions";
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
